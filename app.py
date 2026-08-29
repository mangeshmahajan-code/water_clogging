from flask import Flask,render_template,redirect,url_for,flash
from flask_bootstrap import Bootstrap5
from sqlalchemy.orm import DeclarativeBase,Mapped,mapped_column,relationship
from sqlalchemy import Integer,String,Boolean,Float
from form import reportform,signupform,loginform
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin,login_user, LoginManager, current_user, logout_user,login_required
from supabase import create_client
from verification import confirm_verification_token, generate_verification_token, send_verification_email
import uuid
import os 
from flask_mail import Mail  

load_dotenv()

supabase = create_client(
    os.environ.get("SUPABASE_URL"),
    os.environ.get("SUPABASE_KEY")
)

app = Flask(__name__)
# app['SECRET_KEY'] = os.environ.get("SECRET_KEY")
app.config.from_pyfile('config.py')
print("MAIL_USERNAME:", repr(app.config["MAIL_USERNAME"]))
print("MAIL_PASSWORD length:", len(app.config["MAIL_PASSWORD"] or ""))

Bootstrap5(app)
mail = Mail(app) 

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_message = "You have to login first to report."
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, user_id)

class Base (DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)
db.init_app(app)

class User(db.Model,UserMixin):
    __tablename__ ='users'
    id : Mapped[int] = mapped_column(Integer,primary_key=True)
    name : Mapped[str] = mapped_column(String(20),nullable=False)
    email : Mapped[str] = mapped_column(String(100),nullable=False,unique=True)
    password : Mapped[str] = mapped_column(String,nullable=True)
    is_verified : Mapped[bool] = mapped_column(Boolean,default=False)
    report = relationship("Report",back_populates="author")

class Report (db.Model):
    id : Mapped[int] = mapped_column(Integer,primary_key=True)
    author_id :Mapped[int] = mapped_column(Integer,db.ForeignKey('users.id'))
    author = relationship("User",back_populates="report")
    cause : Mapped[str] = mapped_column(String,nullable=False)
    latitude : Mapped[float] = mapped_column(Float,nullable=True)
    longitude : Mapped[float] = mapped_column(Float,nullable=True)
    image_path : Mapped[str] = mapped_column(String,nullable=False)
    description : Mapped[str] = mapped_column(String,nullable=True)

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    reports = db.session.execute(db.select(Report)).scalars().all()
    reports_list = []

    for r in reports:
        if r.latitude is None or r.longitude is None:
            continue

        img_path = r.image_path

        if img_path and img_path.startswith('reports/'):
            try:
                img_path = supabase.storage.from_("water clogging images").get_public_url(img_path)
            except Exception as e:
                img_path = None

        reports_list.append({
            'id': r.id,
            'latitude': r.latitude,
            'longitude': r.longitude,
            'cause': r.cause,
            'description': r.description,
            'image_path': img_path,
            'author': r.author.name
        })

    return render_template('index.html', reports=reports_list)
@app.route('/report',methods=['GET', 'POST'])
@login_required
def report():
    image_path = url_for('static', filename='images/report.jpg')
    currne_page ="report"
    form = reportform()

    if form.validate_on_submit():
        raw_latitude = form.latitude.data 
        raw_longitude = form.longitude.data 

        if not raw_latitude or not raw_longitude:
            flash("Please allow location access to submit a report.")
            return render_template("form.html",form=form,current_page="report")

        try:
            latitude = float(raw_latitude)
            longitude = float(raw_longitude)
        except ValueError:
            flash("Received invalid location data. Please try again.")
            return render_template("form.html", form=form, current_page="report")
        
        image_file = form.images.data
        extension = os.path.splitext(image_file.filename)[1].lower()
        filename = f"{uuid.uuid4()}{extension}"
        file_path = f"reports/{filename}"

        try:
            file_data =image_file.read()
            supabase.storage.from_("water clogging images").upload(
                path=file_path,
                file=file_data,
                    file_options={
                "content-type": image_file.mimetype
                }
                
            )
            image_url = supabase.storage.from_("water clogging images").get_public_url(file_path)
        except Exception as e :
            app.logger.error(f"Supabase upload failed: {e}")
            flash("We couldn't upload your image right now. Please try again in a moment.")
            return render_template("form.html", form=form, current_page="report")
    
        report = Report(
            author_id =current_user.id,
            image_path=image_url,
            cause=form.cause.data,
            description=form.description.data,
            latitude=latitude,
            longitude=longitude
        )

        db.session.add(report)
        db.session.commit()


        return redirect(url_for('index'))

    return render_template('form.html',form= form, img = image_path,current_page =currne_page)

@app.route('/login', methods=['GET', 'POST'])
def login():
    form = loginform()
    currne_page ="login"
    image_path = url_for('static', filename='images/signup-bg.jpg')
    if form.validate_on_submit():
        email = form.email.data
        user = db.session.execute(db.select(User).where(User.email==email)).scalar()
        password =form.password.data

        if user :
            if check_password_hash(user.password, password):

                if not user.is_verified:

                    flash("Please verify your email before logging in.")
                    return redirect(url_for('login'))#<---- verify page
                
                login_user(user=user)
                return redirect(url_for('index'))
            else:
                flash('The password is invalid. Please try again!')
        else:
            flash('The email is invalid. Please enter a valid email!')
    return render_template('form.html', form=form,current_page =currne_page,img = image_path)

@app.route('/register', methods=['GET', 'POST'])
def register():
    currne_page ="signup"
    form =signupform()
    image_path = url_for('static', filename='images/register-bg.jpg')
    if form.validate_on_submit():
        email = form.email.data
        user = db.session.execute(db.select(User).where(User.email ==email )).scalar()
        if user:
            flash("You've already signed up with that email, log in instead!")
            return redirect(url_for("login"))
        new_user = User(
           name = form.username.data,
           email = email,
           password = generate_password_hash(form.password.data,method='pbkdf2:sha256',salt_length=8) 
        )
        db.session.add(new_user)
        db.session.commit()

        token = generate_verification_token(email)
        verify_url = url_for('verify_email', token=token, _external=True)
        send_verification_email(email_to=email, verify_url=verify_url)

        image_path = url_for('static', filename='images/verification-bg.jpg')
        return render_template('verification.html',email= email,img =image_path)
    return render_template('form.html', form=form,img = image_path,current_page =currne_page)

@app.route("/verify/<token>")
def verify_email(token):
    email = confirm_verification_token(token)
    if not email:
        return "Invalid or expired verification link."

    user = User.query.filter_by(email=email).first()
    if user and not user.is_verified:
        user.is_verified = True
        db.session.commit()
        login_user(user)
        return redirect(url_for('index'))
    else:
        flash("Account already verified. Try to login")
        return redirect(url_for('login'))

@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True)
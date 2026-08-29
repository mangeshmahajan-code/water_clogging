from flask_wtf import FlaskForm
from wtforms import StringField, SubmitField,PasswordField,SelectField,HiddenField
from wtforms.validators import DataRequired, URL,Email
from flask_wtf.file import FileField,FileRequired,FileAllowed
from flask_ckeditor import CKEditorField

class signupform (FlaskForm):
    username = StringField('Enter the Username',validators=[DataRequired()])
    email = StringField('Enter the email',validators=[DataRequired(),Email()])
    password = PasswordField('Enter your password',validators=[DataRequired()])
    submit = SubmitField('Submit')

class loginform (FlaskForm):
    email = StringField('Enter the email',validators=[DataRequired(),Email()])
    password = PasswordField('Enter your password',validators=[DataRequired()])
    submit = SubmitField('Submit')

class reportform (FlaskForm):
    images = FileField("Upload the image",validators=[FileRequired(),FileAllowed(["jpg", "jpeg", "png"], "Images only!")])
    cause = SelectField(
        "Choose the reason",
        choices=[
            ("", "Select the cause"),
            ("Poor drainage system", "Poor drainage system"),
            ("Heavy rainfall", "Heavy rainfall"),
            ("Blocked sewers", "Blocked sewers"),
            ("Damaged water pipe line", "Damaged water pipe line"),
            ("Other", "Other"),
        ],
        validators=[DataRequired(message="Please choose a cause.")]
    )
    latitude = HiddenField()
    longitude = HiddenField()
    description =StringField("Describe the Problem",validators=[])
    submit = SubmitField('Submit')
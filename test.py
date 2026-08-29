from app import app, mail
from flask_mail import Message

with app.app_context():
    msg = Message(
        subject="Test email",
        recipients=["mangesmahajan@gmail.com"],
        body="Flask-Mail + Gmail SMTP is working."
    )
    mail.send(msg)
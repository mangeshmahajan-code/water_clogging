import os 
from dotenv import load_dotenv

load_dotenv()

def _get_clean_env(key, default=None):
    val = os.environ.get(key, default)
    if val is not None:
        return val.strip("'\"")
    return val

SECRET_KEY = _get_clean_env("SECRET_KEY")

MAIL_SERVER = _get_clean_env("MAIL_SERVER", "smtp.gmail.com")

mail_port_raw = _get_clean_env("MAIL_PORT", "587")
MAIL_PORT = int(mail_port_raw) if mail_port_raw and mail_port_raw.isdigit() else 587

mail_use_tls_raw = _get_clean_env("MAIL_USE_TLS", "True")
MAIL_USE_TLS = mail_use_tls_raw.lower() in ("true", "1", "yes")

mail_use_ssl_raw = _get_clean_env("MAIL_USE_SSL", "False")
MAIL_USE_SSL = mail_use_ssl_raw.lower() in ("true", "1", "yes")

MAIL_USERNAME = _get_clean_env("MAIL_USERNAME")
MAIL_PASSWORD = _get_clean_env("MAIL_PASSWORD")
MAIL_DEFAULT_SENDER = _get_clean_env("MAIL_DEFAULT_SENDER", MAIL_USERNAME)

SQLALCHEMY_DATABASE_URI ="sqlite:///water_clogging.db"
SQLALCHEMY_TRACK_MODIFICATIONS = False
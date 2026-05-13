from dataclasses import dataclass
from pathlib import Path
import os


ALLOWED_ENVS = {"dev", "uat", "prod"}

DATABASE_FILE_NAMES = {
    "dev": "project-casa-elsbeth-dev.db",
    "uat": "project-casa-elsbeth-uat.db",
    "prod": "project-casa-elsbeth-prod.db",
}


@dataclass(frozen=True)
class Settings:
    app_env: str
    base_dir: Path
    data_dir: Path
    database_path: Path
    app_title: str
    allow_demo_seed_without_confirmation: bool


def load_settings() -> Settings:
    app_env = os.getenv("APP_ENV", "dev").strip().lower()

    if app_env not in ALLOWED_ENVS:
        raise ValueError(
            "APP_ENV must be one of: dev, uat, prod. "
            "Received: " + repr(app_env)
        )

    base_dir = Path(__file__).resolve().parent
    data_dir = base_dir / "data"
    data_dir.mkdir(exist_ok=True)

    database_path = data_dir / DATABASE_FILE_NAMES[app_env]

    return Settings(
        app_env=app_env,
        base_dir=base_dir,
        data_dir=data_dir,
        database_path=database_path,
        app_title="Project Casa Elsbeth API",
        allow_demo_seed_without_confirmation=app_env in {"dev", "uat"},
    )


settings = load_settings()

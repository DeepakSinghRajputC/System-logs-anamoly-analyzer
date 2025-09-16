import json
from datetime import datetime
import joblib
import numpy as np
from sklearn.ensemble import IsolationForest

# Generate simple synthetic data for two features: failed_logins (int) and error_rate (float)
# Normal behavior around failed_logins ~ Poisson(1), error_rate ~ N(0.05, 0.02)
# Add some outliers with high failed_logins and high error_rate

def generate_data(n_normal: int = 500, n_outliers: int = 25, random_state: int = 42):
    rng = np.random.default_rng(random_state)
    failed_logins_normal = rng.poisson(1, size=n_normal)
    error_rate_normal = np.clip(rng.normal(0.05, 0.02, size=n_normal), 0, 1)

    failed_logins_outliers = rng.poisson(8, size=n_outliers)
    error_rate_outliers = np.clip(rng.normal(0.35, 0.1, size=n_outliers), 0, 1)

    X_normal = np.column_stack([failed_logins_normal, error_rate_normal])
    X_outliers = np.column_stack([failed_logins_outliers, error_rate_outliers])
    X = np.vstack([X_normal, X_outliers])
    return X


def train_and_save(model_path: str = 'model.joblib', info_path: str = 'model_info.json'):
    X = generate_data()
    # IsolationForest expects continuous features; both features are numeric already
    model = IsolationForest(n_estimators=200, contamination=0.05, random_state=42)
    model.fit(X)

    joblib.dump(model, model_path)

    info = {
        'version': '1.0.0',
        'trained_at': datetime.utcnow().isoformat() + 'Z',
        'features': ['failed_logins', 'error_rate'],
        'model': 'IsolationForest',
        'params': {'n_estimators': 200, 'contamination': 0.05, 'random_state': 42}
    }
    with open(info_path, 'w', encoding='utf-8') as f:
        json.dump(info, f)


if __name__ == '__main__':
    train_and_save()
    print('Model trained and saved.')

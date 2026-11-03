import os
import sys

# Ensure backend root is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.app import create_app

app = create_app()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    # host='0.0.0.0' enables actual smartphone connectivity on local network/Wi-Fi
    print(f"\n[SheDefender] API server starting on http://0.0.0.0:{port}")
    print(f"[SheDefender] Smartphone connection URL: http://<your-local-ip>:{port}\n")
    debug = os.environ.get('DEBUG', 'False').strip().lower() in ('1', 'true', 'yes', 'on')
    app.run(host='0.0.0.0', port=port, debug=debug)

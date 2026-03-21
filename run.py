"""PnL Reporter — start backend and frontend together."""

import os
import subprocess
import sys
import signal

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")
FRONTEND_DIR = os.path.join(ROOT, "frontend")
VENV_PYTHON = os.path.join(BACKEND_DIR, ".venv", "bin", "python")


def main():
    procs = []

    # Backend: uvicorn via the venv python
    print("[run.py] Starting backend on http://localhost:8000 ...")
    backend = subprocess.Popen(
        [VENV_PYTHON, "-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
        cwd=BACKEND_DIR,
    )
    procs.append(backend)

    # Frontend: vite dev server
    print("[run.py] Starting frontend on http://localhost:5173 ...")
    frontend = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=FRONTEND_DIR,
    )
    procs.append(frontend)

    print("[run.py] App running — open http://localhost:5173")
    print("[run.py] Press Ctrl+C to stop.\n")

    def shutdown(sig, frame):
        print("\n[run.py] Shutting down...")
        for p in procs:
            p.terminate()
        for p in procs:
            p.wait()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Wait for either process to exit
    for p in procs:
        p.wait()


if __name__ == "__main__":
    main()

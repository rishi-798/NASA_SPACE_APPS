"""Start one API worker, wait for readiness, then expose nginx reverse proxy."""
from pathlib import Path
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

stopped = threading.Event()
for signum in (signal.SIGTERM, signal.SIGINT):
    signal.signal(signum, lambda *_: stopped.set())
port = int(os.environ.get('PORT', '8080'))
configuration = Path('/tmp/nginx.conf')
configuration.write_text(Path('/app/nginx.conf').read_text().replace('__INGRESS_PORT__', str(port)))
processes = [subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.app:app',
                              '--host', '127.0.0.1', '--port', '8081', '--workers', '1'])]
exit_code = 1
try:
    for _ in range(90):
        if stopped.is_set() or processes[0].poll() is not None:
            break
        try:
            with urllib.request.urlopen('http://127.0.0.1:8081/health', timeout=.5) as response:
                if response.status == 200:
                    processes.append(subprocess.Popen(['nginx', '-c', str(configuration), '-g', 'daemon off;']))
                    break
        except (OSError, urllib.error.URLError):
            time.sleep(.5)
    if len(processes) != 2:
        raise RuntimeError('API startup health check did not pass')
    while not stopped.wait(.5):
        if any(process.poll() is not None for process in processes):
            break
    exit_code = 0 if stopped.is_set() else 1
finally:
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
    for process in processes:
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()
sys.exit(exit_code)

"""Serve a startup page using an existing bundled host's DNS/TLS settings."""
import argparse
import base64
import importlib.util
import io
from pathlib import Path
import sys
import zipfile


def prepare_host(base_host, startup_page, recovery_page=None):
    spec = importlib.util.spec_from_file_location('payload_page_host', base_host)
    host = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(host)
    original = host.get_embedded_zip()
    if original is None or 'index.html' not in original.namelist():
        raise ValueError('The base host must contain a bundled index.html.')
    pages = {name: original.read(name) for name in original.namelist()}
    pages.setdefault('install.html', pages['index.html'])
    pages['index.html'] = Path(startup_page).read_bytes()
    if recovery_page is not None:
        pages['recovery.html'] = Path(recovery_page).read_bytes()
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as replacement:
        for name, data in pages.items():
            replacement.writestr(name, data)
    host.EMBEDDED_ZIP_B64 = base64.b64encode(archive.getvalue()).decode('ascii')
    host._embedded_zip_loaded = False
    host._embedded_zip_cache = None
    return host


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-host', required=True, type=Path)
    parser.add_argument('--startup-page', required=True, type=Path)
    parser.add_argument('--recovery-page', type=Path)
    args, host_args = parser.parse_known_args(argv)
    if host_args[:1] == ['--']:
        host_args = host_args[1:]
    host = prepare_host(args.base_host, args.startup_page, args.recovery_page)
    return host.main(host_args)


if __name__ == '__main__':
    sys.exit(main())

"""Install the official NAIF kernels required by this project's calculations."""

from urllib.request import urlopen

from backend.spice_kernels import kernel_directory, load_spice_kernels


BASE = "https://naif.jpl.nasa.gov/pub/naif/"
KERNEL_URLS = {
    "naif0012.tls": BASE + "generic_kernels/lsk/naif0012.tls",
    "de440s.bsp": BASE + "generic_kernels/spk/planets/de440s.bsp",
    "pck00011.tpc": BASE + "generic_kernels/pck/pck00011.tpc",
    "moon_pa_de440_200625.bpc": BASE + "generic_kernels/pck/moon_pa_de440_200625.bpc",
    "moon_de440_220930.tf": BASE + "pds/pds4/clps/clps_spice/spice_kernels/fk/moon_de440_220930.tf",
}


def main():
    directory = kernel_directory()
    directory.mkdir(parents=True, exist_ok=True)
    for name, url in KERNEL_URLS.items():
        destination = directory / name
        if destination.is_file():
            print(f"Already installed: {name}", flush=True)
            continue
        print(f"Downloading {name} from NAIF...", flush=True)
        temporary = directory / (name + ".part")
        try:
            with urlopen(url, timeout=120) as response, temporary.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
    load_spice_kernels()
    print("All SPICE kernels loaded successfully.")


if __name__ == "__main__":
    main()

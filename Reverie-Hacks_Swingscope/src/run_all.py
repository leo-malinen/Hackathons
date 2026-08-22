import argparse
import subprocess
import sys

STEPS = [
    ("build features", ["-m", "src.build_features"]),
    ("module a clustering", ["-m", "src.module_a_cluster"]),
    ("module b swing detector", ["-m", "src.module_b_swing"]),
    ("module c win probability", ["-m", "src.module_c_winprob"]),
    ("pca figure", ["-m", "src.viz.pca_plot"]),
    ("volatility map", ["-m", "src.viz.volatility_map"]),
    ("evaluate", ["-m", "src.evaluate"]),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["auto", "real", "synthetic"], default="auto")
    parser.add_argument("--epochs", type=int, default=150)
    parser.add_argument("--ablation", action="store_true")
    args = parser.parse_args()

    for name, cmd in STEPS:
        full = [sys.executable] + cmd
        if "build_features" in cmd[1]:
            full += ["--mode", args.mode]
        if "module_b" in cmd[1]:
            full += ["--epochs", str(args.epochs)]
            if args.ablation:
                full += ["--ablation"]
        if "module_c" in cmd[1]:
            full += ["--epochs", str(args.epochs)]

        print("=" * 70)
        print(name.upper())
        print("=" * 70)
        result = subprocess.run(full)
        if result.returncode != 0:
            sys.exit(result.returncode)
        print()


if __name__ == "__main__":
    main()

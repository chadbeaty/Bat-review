#!/usr/bin/env python3
"""Export a trained detector to Core ML for on-device inference (Neural Engine), and check it matches PyTorch.

Usage: python3 ml/train/export_coreml.py RUN_DIR [--checkpoint checkpoint_best_total.pth] [--size small] [--res 640]

Writes RUN_DIR/GapperDetector.mlpackage plus parity.json (max difference between PyTorch and Core ML outputs on
random input). A model that fails parity must not ship. Conversion needs macOS for the parity check (Core ML only
runs there); the conversion itself also works on Linux.

Note: RF-DETR's own exporter targets ONNX. coremltools no longer converts ONNX, so this traces the PyTorch module
directly. If a future rfdetr release changes its internals, update `torch_module()` below; the parity check catches
a silent mismatch.
"""
import argparse
import json
from pathlib import Path


def torch_module(model):
    # rfdetr wraps the network; the nn.Module sits at model.model.model in rfdetr 1.x.
    inner = getattr(model, "model", model)
    return getattr(inner, "model", inner)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run", type=Path)
    ap.add_argument("--checkpoint", default="checkpoint_best_total.pth")
    ap.add_argument("--size", choices=["nano", "small", "medium"], default="small")
    ap.add_argument("--res", type=int, default=640)
    a = ap.parse_args()

    import numpy as np
    import torch
    import coremltools as ct
    import rfdetr

    cls = {"nano": rfdetr.RFDETRNano, "small": rfdetr.RFDETRSmall, "medium": rfdetr.RFDETRMedium}[a.size]
    model = cls(resolution=a.res, pretrain_weights=str(a.run / a.checkpoint))
    net = torch_module(model).eval()

    class Wrapped(torch.nn.Module):
        """Fixed output signature for Core ML: boxes (cx, cy, w, h normalized) and class logits."""

        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, x):
            out = self.m(x)
            return out["pred_boxes"], out["pred_logits"]

    w = Wrapped(net)
    ex = torch.rand(1, 3, a.res, a.res)
    traced = torch.jit.trace(w, ex, strict=False)
    ml = ct.convert(
        traced,
        inputs=[ct.ImageType(name="image", shape=ex.shape, scale=1 / 255.0, color_layout=ct.colorlayout.RGB)],
        outputs=[ct.TensorType(name="boxes"), ct.TensorType(name="logits")],
        minimum_deployment_target=ct.target.iOS17,
        compute_precision=ct.precision.FLOAT16,
    )
    card = json.loads((a.run / "model_card.json").read_text()) if (a.run / "model_card.json").exists() else {}
    ml.short_description = "Gapper slow-pitch detector: ball, bat, hitter, plate"
    ml.user_defined_metadata["dataset_hash"] = card.get("dataset_hash", "unknown")
    ml.user_defined_metadata["classes"] = "ball,bat,hitter,plate"
    out = a.run / "GapperDetector.mlpackage"
    ml.save(str(out))

    parity = {"checked": False}
    try:
        from PIL import Image

        img = (np.random.rand(a.res, a.res, 3) * 255).astype("uint8")
        with torch.no_grad():
            tb, tl = w(torch.from_numpy(img).permute(2, 0, 1).float().unsqueeze(0) / 255.0)
        pred = ml.predict({"image": Image.fromarray(img)})
        parity = {
            "checked": True,
            "max_box_diff": float(np.abs(pred["boxes"] - tb.numpy()).max()),
            "max_logit_diff": float(np.abs(pred["logits"] - tl.numpy()).max()),
        }
        parity["ok"] = parity["max_box_diff"] < 0.01 and parity["max_logit_diff"] < 0.1
    except Exception as e:  # Core ML predict only runs on macOS
        parity["note"] = f"parity not checked here: {e}"
    (a.run / "parity.json").write_text(json.dumps(parity, indent=2))
    print(f"saved {out}\n{json.dumps(parity, indent=2)}")


if __name__ == "__main__":
    main()

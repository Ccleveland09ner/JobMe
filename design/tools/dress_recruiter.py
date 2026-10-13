"""
Dress the Ready Player Me recruiter (brunette.glb) in the Avaturn suit.

Run headless:
  blender -b --factory-startup --python design/tools/dress_recruiter.py -- \
      design/avatar-src/brunette.glb design/avatar-src/avaturn.glb \
      design/avatar-src/build/recruiter-dressed.glb

See design/tools/README.md for the whole rebuild.

How it works. The suit (`avaturn_look_0`) is skinned to Avaturn's skeleton,
and both skeletons use the same Mixamo-style bone names. So rather than
scaling the garment by eye:

  1. Pose Avaturn's skeleton so every joint lands exactly on the matching
     joint of the recruiter's rest pose (direction AND length per bone, plus
     a width factor for the torso). The suit deforms with it.
  2. Bake that deformation into the suit's mesh.
  3. Re-bind the suit to the recruiter's skeleton. Vertex groups are named by
     bone, so the existing weights carry straight over.
  4. Drop the gym top and leggings, and everything else from Avaturn.
"""

import os
import sys

import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
BRUNETTE, AVATURN, OUT = argv[0], argv[1], argv[2]

GARMENT = "avaturn_look_0"
DROP_FROM_RECRUITER = {"Wolf3D_Outfit_Top", "Wolf3D_Outfit_Bottom"}

# Bone -> the joint it points at. Lengths and directions are measured head to
# child head, so they do not depend on how each importer guessed bone tails.
CHILD = {
    "Hips": "Spine",
    "Spine": "Spine1",
    "Spine1": "Spine2",
    "Spine2": "Neck",
    "Neck": "Head",
    "LeftShoulder": "LeftArm",
    "LeftArm": "LeftForeArm",
    "LeftForeArm": "LeftHand",
    "LeftHand": "LeftHandMiddle1",
    "RightShoulder": "RightArm",
    "RightArm": "RightForeArm",
    "RightForeArm": "RightHand",
    "RightHand": "RightHandMiddle1",
    "LeftUpLeg": "LeftLeg",
    "LeftLeg": "LeftFoot",
    "LeftFoot": "LeftToeBase",
    "RightUpLeg": "RightLeg",
    "RightLeg": "RightFoot",
    "RightFoot": "RightToeBase",
}
TORSO = {"Hips", "Spine", "Spine1", "Spine2"}


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def armature_of(objs):
    return next(o for o in objs if o.type == "ARMATURE")


def joint_world(arm, name, posed=False):
    if posed:
        return arm.matrix_world @ arm.pose.bones[name].head
    return arm.matrix_world @ arm.data.bones[name].head_local


def span(arm, a, b):
    return (joint_world(arm, a) - joint_world(arm, b)).length


# ---------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
rec_objs = import_glb(BRUNETTE)
ava_objs = import_glb(AVATURN)
rec, ava = armature_of(rec_objs), armature_of(ava_objs)
garment = next(o for o in ava_objs if o.name.startswith(GARMENT))

shoulder_ratio = span(rec, "LeftArm", "RightArm") / span(ava, "LeftArm", "RightArm")
hip_ratio = span(rec, "LeftUpLeg", "RightUpLeg") / span(ava, "LeftUpLeg", "RightUpLeg")
print(f"[dress] shoulder ratio {shoulder_ratio:.3f}  hip ratio {hip_ratio:.3f}")

# Torso widths taper from the hips to the shoulders. Using the raw hip ratio
# at the hips (much wider than the shoulder ratio on this stylised body) gave
# the jacket an exaggerated flare, so the hips are pulled halfway toward the
# shoulders and the spine steps evenly between them.
hips_w = (hip_ratio + shoulder_ratio) / 2
TORSO_WIDTH = {
    "Hips": hips_w,
    "Spine": hips_w + (shoulder_ratio - hips_w) * 1 / 3,
    "Spine1": hips_w + (shoulder_ratio - hips_w) * 2 / 3,
    "Spine2": shoulder_ratio,
}

# 1. Pose Avaturn's skeleton onto the recruiter's joints, parents first.
bpy.context.view_layer.objects.active = ava
bpy.ops.object.mode_set(mode="POSE")
for pb in ava.pose.bones:
    pb.bone.inherit_scale = "NONE"  # each bone gets exactly the scale we set

to_ava = ava.matrix_world.inverted()


def depth(b):
    d = 0
    while b.parent:
        b, d = b.parent, d + 1
    return d


for bone in sorted(ava.data.bones, key=depth):
    name = bone.name
    if name not in rec.data.bones:
        continue
    pb = ava.pose.bones[name]
    rest = bone.matrix_local
    head = to_ava @ joint_world(rec, name)

    child = CHILD.get(name)
    if child and child in rec.data.bones and child in ava.data.bones:
        rest_dir = ava.data.bones[child].head_local - bone.head_local
        want_dir = (to_ava @ joint_world(rec, child)) - head
        rot = rest_dir.rotation_difference(want_dir)
        stretch = want_dir.length / max(rest_dir.length, 1e-6)
    else:
        rot = Matrix.Identity(3).to_quaternion()
        stretch = 1.0

    width = TORSO_WIDTH.get(name, stretch)
    # Scale along the bone's own Y only when Y really is the joint direction;
    # otherwise a non-uniform scale would shear, so fall back to uniform.
    y_axis = rest.to_3x3().col[1]
    aligned = child and y_axis.angle(rest_dir, 1.0) < 0.15 if child else False
    scale = Matrix.Diagonal((width, stretch, width)) if aligned else Matrix.Diagonal((stretch,) * 3)

    pb.matrix = Matrix.Translation(head) @ (rot.to_matrix() @ rest.to_3x3() @ scale).to_4x4()
    bpy.context.view_layer.update()

bpy.ops.object.mode_set(mode="OBJECT")

# 2. Bake the fitted shape into the garment.
bpy.context.view_layer.objects.active = garment
for m in list(garment.modifiers):
    if m.type == "ARMATURE":
        bpy.ops.object.modifier_apply(modifier=m.name)

# 3. Re-bind to the recruiter's skeleton.
world = garment.matrix_world.copy()
garment.parent = rec
garment.matrix_world = world
mod = garment.modifiers.new("Armature", "ARMATURE")
mod.object = rec
garment.name = "Recruiter_Suit"

# 4. Remove what is no longer needed.
for o in rec_objs:
    if any(o.name.startswith(n) for n in DROP_FROM_RECRUITER):
        bpy.data.objects.remove(o, do_unlink=True)
for o in ava_objs:
    if o is not garment and o.name in bpy.data.objects:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action="DESELECT")
rec.select_set(True)
for o in rec.children_recursive:
    o.select_set(True)
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_morph=True,
    export_animations=False,
)
print(f"[dress] wrote {OUT}")
print("[dress] objects:", [o.name for o in rec.children_recursive])

"""
Retarget Mixamo clips onto the dressed recruiter and bake them into the GLB.

Run headless:
  blender -b --factory-startup --python design/tools/bake_animation.py -- \
      design/avatar-src/build/recruiter-dressed.glb \
      design/avatar-src/build/recruiter-animated.glb \
      "design/avatar-src/animations/Sitting Idle.fbx" [more.fbx ...]

See design/tools/README.md for the whole rebuild.

Each clip becomes one glTF animation, named after its file ("Sitting Idle").
The first one is what the room plays.

Why not just copy the rotations: Mixamo's skeleton rests in a T-pose and the
recruiter's in an A-pose, and the two importers orient bones differently, so
copied local rotations twist the limbs. Instead, per bone:

  1. Align rest poses: find the rotation that turns the recruiter's bone
     (head -> child joint) onto the Mixamo bone's direction. Bones without a
     tracked child inherit their parent's alignment.
  2. Per frame: recruiter world rotation =
         mixamo world rotation  @  mixamo rest⁻¹ @ alignment @ recruiter rest
     which at Mixamo's rest frame reproduces the aligned rest pose, and
     otherwise carries Mixamo's motion over exactly.
  3. The hips also carry translation, scaled by the ratio of hip heights.

The face shapes are untouched; the room drives them live.
"""

import os
import sys

import bpy
from mathutils import Matrix, Quaternion

argv = sys.argv[sys.argv.index("--") + 1 :]
SOURCE, OUT, CLIPS = argv[0], argv[1], argv[2:]

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


def strip(name):
    """`mixamorig:LeftArm` / `mixamorig1:LeftArm` -> `LeftArm`."""
    return name.split(":")[-1]


def depth(bone):
    d = 0
    while bone.parent:
        bone, d = bone.parent, d + 1
    return d


def imported(op, **kw):
    before = set(bpy.data.objects)
    op(**kw)
    return [o for o in bpy.data.objects if o not in before]


bpy.ops.wm.read_factory_settings(use_empty=True)
rec_objs = imported(bpy.ops.import_scene.gltf, filepath=SOURCE)
rec = next(o for o in rec_objs if o.type == "ARMATURE")
rec_rot = rec.matrix_world.to_quaternion()
scene = bpy.context.scene

for clip in CLIPS:
    name = os.path.splitext(os.path.basename(clip))[0]
    src_objs = imported(bpy.ops.import_scene.fbx, filepath=clip, ignore_leaf_bones=True)
    src = next(o for o in src_objs if o.type == "ARMATURE")
    src_action = src.animation_data.action
    start, end = (int(round(f)) for f in src_action.frame_range)
    scene.render.fps = 30

    src_bones = {strip(b.name): b for b in src.data.bones}
    mapped = sorted(
        (b for b in rec.data.bones if b.name in src_bones),
        key=depth,
    )
    print(f"[bake] {name}: frames {start}-{end}, {len(mapped)} bones mapped")

    def rest_world(arm, bone):
        return arm.matrix_world @ bone.matrix_local

    def head_world(arm, bone):
        return arm.matrix_world @ bone.head_local

    # 1. Rest alignment per bone, parents first.
    align, offset = {}, {}
    for b in mapped:
        sb = src_bones[b.name]
        child = CHILD.get(b.name)
        if child and child in rec.data.bones and child in src_bones:
            t_dir = head_world(rec, rec.data.bones[child]) - head_world(rec, b)
            s_dir = head_world(src, src_bones[child]) - head_world(src, sb)
            align[b.name] = t_dir.rotation_difference(s_dir)
        else:
            parent = b.parent
            while parent and parent.name not in align:
                parent = parent.parent
            align[b.name] = align[parent.name] if parent else Quaternion()
        rs = rest_world(src, sb).to_quaternion()
        rt = rest_world(rec, b).to_quaternion()
        offset[b.name] = rs.inverted() @ align[b.name] @ rt

    # Hip translation: Mixamo is in its own units; scale by hip height.
    hips_src_rest = head_world(src, src_bones["Hips"])
    hips_rec_rest = head_world(rec, rec.data.bones["Hips"])
    hip_scale = hips_rec_rest.z / max(hips_src_rest.z, 1e-6)

    # 2. Bake frame by frame into a new action on the recruiter.
    rec.animation_data_create()
    action = bpy.data.actions.new(name)
    rec.animation_data.action = action
    for pb in rec.pose.bones:
        pb.rotation_mode = "QUATERNION"

    to_rec = rec.matrix_world.inverted()
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for b in mapped:
            pb = rec.pose.bones[b.name]
            sw = (src.matrix_world @ src.pose.bones[src_bones[b.name].name].matrix).to_quaternion()
            tw = sw @ offset[b.name]
            ta = rec_rot.inverted() @ tw
            current = pb.matrix.copy()
            location = current.translation
            if b.name == "Hips":
                src_hips = src.matrix_world @ src.pose.bones[src_bones["Hips"].name].head
                world = hips_rec_rest + (src_hips - hips_src_rest) * hip_scale
                location = to_rec @ world
            pb.matrix = Matrix.Translation(location) @ ta.to_matrix().to_4x4()
            bpy.context.view_layer.update()
            pb.keyframe_insert("rotation_quaternion", frame=frame)
            if b.name == "Hips":
                pb.keyframe_insert("location", frame=frame)

    # Keep the action for export even when the next clip replaces it as active.
    action.use_fake_user = True
    track = rec.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, start, action)
    rec.animation_data.action = None

    for o in src_objs:
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
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
)
print(f"[bake] wrote {OUT}")

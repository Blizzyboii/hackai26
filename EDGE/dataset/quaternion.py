import torch

# ---- Start Replacement PyTorch3D Functions ----
def _axis_angle_rotation(axis: str, angle: torch.Tensor) -> torch.Tensor:
    cos = torch.cos(angle)
    sin = torch.sin(angle)
    one = torch.ones_like(angle)
    zero = torch.zeros_like(angle)

    if axis == "X":
        R_flat = (one, zero, zero, zero, cos, -sin, zero, sin, cos)
    elif axis == "Y":
        R_flat = (cos, zero, sin, zero, one, zero, -sin, zero, cos)
    elif axis == "Z":
        R_flat = (cos, -sin, zero, sin, cos, zero, zero, zero, one)
    else:
        raise ValueError("letter must be either X, Y or Z.")

    return torch.stack(R_flat, -1).reshape(angle.shape + (3, 3))

def euler_angles_to_matrix(euler_angles: torch.Tensor, convention: str) -> torch.Tensor:
    if euler_angles.dim() == 0 or euler_angles.shape[-1] != 3:
        raise ValueError("Invalid input euler angles.")
    if len(convention) != 3:
        raise ValueError("Convention must have 3 letters.")
    if convention[1] in (convention[0], convention[2]):
        raise ValueError(f"Invalid convention {convention}.")
    for letter in convention:
        if letter not in ("X", "Y", "Z"):
            raise ValueError(f"Invalid letter {letter} in convention string.")
    matrices = [
        _axis_angle_rotation(c, e)
        for c, e in zip(convention, torch.unbind(euler_angles, -1))
    ]
    return torch.matmul(torch.matmul(matrices[0], matrices[1]), matrices[2])

def axis_angle_to_matrix(axis_angle: torch.Tensor) -> torch.Tensor:
    angle = torch.norm(axis_angle, p=2, dim=-1, keepdim=True)
    axis = axis_angle / (angle + 1e-8)
    cos = torch.cos(angle)
    sin = torch.sin(angle)
    c1 = 1 - cos
    x, y, z = axis[..., 0:1], axis[..., 1:2], axis[..., 2:3]
    R = torch.cat([
        cos + x*x*c1, x*y*c1 - z*sin, x*z*c1 + y*sin,
        x*y*c1 + z*sin, cos + y*y*c1, y*z*c1 - x*sin,
        x*z*c1 - y*sin, y*z*c1 + x*sin, cos + z*z*c1
    ], -1).view(*axis_angle.shape[:-1], 3, 3)
    return R

def matrix_to_rotation_6d(matrix: torch.Tensor) -> torch.Tensor:
    return matrix[..., :2, :].clone().reshape(*matrix.size()[:-2], 6)

def rotation_6d_to_matrix(d6: torch.Tensor) -> torch.Tensor:
    a1, a2 = d6[..., :3], d6[..., 3:]
    b1 = torch.nn.functional.normalize(a1, dim=-1)
    b2 = a2 - (b1 * a2).sum(-1, keepdim=True) * b1
    b2 = torch.nn.functional.normalize(b2, dim=-1)
    b3 = torch.cross(b1, b2, dim=-1)
    return torch.stack((b1, b2, b3), dim=-2)

def matrix_to_quaternion(matrix: torch.Tensor) -> torch.Tensor:
    m00, m01, m02 = matrix[..., 0, 0], matrix[..., 0, 1], matrix[..., 0, 2]
    m10, m11, m12 = matrix[..., 1, 0], matrix[..., 1, 1], matrix[..., 1, 2]
    m20, m21, m22 = matrix[..., 2, 0], matrix[..., 2, 1], matrix[..., 2, 2]
    sym = torch.stack([m00, m11, m22], dim=-1)
    tr = sym.sum(dim=-1)
    max_sym = sym.max(dim=-1)[0]
    is_tr_max = tr > max_sym
    w = torch.where(is_tr_max, (tr + 1).sqrt() / 2, torch.zeros_like(tr))
    x = torch.where(is_tr_max, (m21 - m12) / (4 * w + 1e-8), torch.zeros_like(tr))
    y = torch.where(is_tr_max, (m02 - m20) / (4 * w + 1e-8), torch.zeros_like(tr))
    z = torch.where(is_tr_max, (m10 - m01) / (4 * w + 1e-8), torch.zeros_like(tr))
    is_m00_max = (m00 == max_sym) & ~is_tr_max
    x = torch.where(is_m00_max, (m00 - m11 - m22 + 1).sqrt() / 2, x)
    w = torch.where(is_m00_max, (m21 - m12) / (4 * x + 1e-8), w)
    y = torch.where(is_m00_max, (m01 + m10) / (4 * x + 1e-8), y)
    z = torch.where(is_m00_max, (m02 + m20) / (4 * x + 1e-8), z)
    is_m11_max = (m11 == max_sym) & ~is_tr_max & ~is_m00_max
    y = torch.where(is_m11_max, (m11 - m00 - m22 + 1).sqrt() / 2, y)
    w = torch.where(is_m11_max, (m02 - m20) / (4 * y + 1e-8), w)
    x = torch.where(is_m11_max, (m01 + m10) / (4 * y + 1e-8), x)
    z = torch.where(is_m11_max, (m12 + m21) / (4 * y + 1e-8), z)
    is_m22_max = (m22 == max_sym) & ~is_tr_max & ~is_m00_max & ~is_m11_max
    z = torch.where(is_m22_max, (m22 - m00 - m11 + 1).sqrt() / 2, z)
    w = torch.where(is_m22_max, (m10 - m01) / (4 * z + 1e-8), w)
    x = torch.where(is_m22_max, (m02 + m20) / (4 * z + 1e-8), x)
    y = torch.where(is_m22_max, (m12 + m21) / (4 * z + 1e-8), y)
    return torch.stack([w, x, y, z], dim=-1)

def quaternion_to_matrix(quaternions: torch.Tensor) -> torch.Tensor:
    r, i, j, k = torch.unbind(quaternions, -1)
    two_s = 2.0 / (quaternions * quaternions).sum(-1)
    o = torch.stack(
        (
            1 - two_s * (j * j + k * k),
            two_s * (i * j - k * r),
            two_s * (i * k + j * r),
            two_s * (i * j + k * r),
            1 - two_s * (i * i + k * k),
            two_s * (j * k - i * r),
            two_s * (i * k - j * r),
            two_s * (j * k + i * r),
            1 - two_s * (i * i + j * j),
        ),
        -1,
    )
    return o.reshape(quaternions.shape[:-1] + (3, 3))

def matrix_to_axis_angle(matrix: torch.Tensor) -> torch.Tensor:
    from torch.nn.functional import normalize
    quat = matrix_to_quaternion(matrix)
    axis = normalize(quat[..., 1:], dim=-1)
    angle = 2 * torch.acos(torch.clamp(quat[..., 0], min=-1.0, max=1.0))
    return axis * angle.unsqueeze(-1)

def axis_angle_to_quaternion(axis_angle: torch.Tensor) -> torch.Tensor:
    angles = torch.norm(axis_angle, p=2, dim=-1, keepdim=True)
    half_angles = angles * 0.5
    eps = 1e-6
    small_angles = angles.abs() < eps
    sin_half_angles_over_angles = torch.empty_like(angles)
    sin_half_angles_over_angles[~small_angles] = (
        torch.sin(half_angles[~small_angles]) / angles[~small_angles]
    )
    sin_half_angles_over_angles[small_angles] = (
        0.5 - (angles[small_angles] * angles[small_angles]) / 48
    )
    quaternions = torch.cat(
        [torch.cos(half_angles), axis_angle * sin_half_angles_over_angles], dim=-1
    )
    return quaternions

def quaternion_multiply(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    aw, ax, ay, az = torch.unbind(a, -1)
    bw, bx, by, bz = torch.unbind(b, -1)
    ow = aw * bw - ax * bx - ay * by - az * bz
    ox = aw * bx + ax * bw + ay * bz - az * by
    oy = aw * by - ax * bz + ay * bw + az * bx
    oz = aw * bz + ax * by - ay * bx + az * bw
    return torch.stack((ow, ox, oy, oz), -1)

def quaternion_apply(quaternion: torch.Tensor, point: torch.Tensor) -> torch.Tensor:
    if point.size(-1) != 3:
        raise ValueError(f"Points are {point.shape}, not 3D")
    real_parts = quaternion[..., 0]
    imag_parts = quaternion[..., 1:]
    pt_sq = (imag_parts * point).sum(-1, keepdim=True)
    cross_pt = torch.cross(imag_parts, point, dim=-1)
    return point + 2 * (cross_pt * real_parts.unsqueeze(-1) + torch.cross(imag_parts, cross_pt, dim=-1))

def quaternion_to_axis_angle(quaternions: torch.Tensor) -> torch.Tensor:
    norms = torch.norm(quaternions[..., 1:], p=2, dim=-1, keepdim=True)
    half_angles = torch.atan2(norms, quaternions[..., :1])
    angles = 2 * half_angles
    eps = 1e-6
    small_angles = angles.abs() < eps
    sin_half_angles_over_angles = torch.empty_like(angles)
    sin_half_angles_over_angles[~small_angles] = (
        torch.sin(half_angles[~small_angles]) / angles[~small_angles]
    )
    sin_half_angles_over_angles[small_angles] = (
        0.5 - (angles[small_angles] * angles[small_angles]) / 48
    )
    return quaternions[..., 1:] / sin_half_angles_over_angles

class RotateAxisAngle:
    def __init__(self, angle, axis="X", degrees=True):
        if degrees:
            angle = angle * torch.pi / 180.0
        self.angle = torch.tensor([angle])
        self.axis = axis

    def transform_points(self, points):
        rot_mat = _axis_angle_rotation(self.axis, self.angle).to(points.device)
        return torch.matmul(points, rot_mat.transpose(-1, -2))
# ---- End Replacement PyTorch3D Functions ----


def quat_to_6v(q):
    assert q.shape[-1] == 4
    mat = quaternion_to_matrix(q)
    mat = matrix_to_rotation_6d(mat)
    return mat


def quat_from_6v(q):
    assert q.shape[-1] == 6
    mat = rotation_6d_to_matrix(q)
    quat = matrix_to_quaternion(mat)
    return quat


def ax_to_6v(q):
    assert q.shape[-1] == 3
    mat = axis_angle_to_matrix(q)
    mat = matrix_to_rotation_6d(mat)
    return mat


def ax_from_6v(q):
    assert q.shape[-1] == 6
    mat = rotation_6d_to_matrix(q)
    ax = matrix_to_axis_angle(mat)
    return ax


def quat_slerp(x, y, a):
    """
    Performs spherical linear interpolation (SLERP) between x and y, with proportion a

    :param x: quaternion tensor (N, S, J, 4)
    :param y: quaternion tensor (N, S, J, 4)
    :param a: interpolation weight (S, )
    :return: tensor of interpolation results
    """
    len = torch.sum(x * y, axis=-1)

    neg = len < 0.0
    len[neg] = -len[neg]
    y[neg] = -y[neg]

    a = torch.zeros_like(x[..., 0]) + a

    amount0 = torch.zeros_like(a)
    amount1 = torch.zeros_like(a)

    linear = (1.0 - len) < 0.01
    omegas = torch.arccos(len[~linear])
    sinoms = torch.sin(omegas)

    amount0[linear] = 1.0 - a[linear]
    amount0[~linear] = torch.sin((1.0 - a[~linear]) * omegas) / sinoms

    amount1[linear] = a[linear]
    amount1[~linear] = torch.sin(a[~linear] * omegas) / sinoms

    # reshape
    amount0 = amount0[..., None]
    amount1 = amount1[..., None]

    res = amount0 * x + amount1 * y

    return res

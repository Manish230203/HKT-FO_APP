export const ADMIN_ROLE = "Admin";
export const SUPERVISOR_ROLE = "Supervisor";
export const MAIN_GATE_SUPERVISOR_ROLE = "Main Gate Supervisor";
export const FIELD_OFFICER_ROLE = "Field Officer";

export const getStoredUser = () => {
  const raw = sessionStorage.getItem("user");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const getCurrentRole = () => {
  const role = getStoredUser()?.role ?? null;
  if (role && role.toLowerCase() === "it admin") {
    return ADMIN_ROLE;
  }
  return role;
};

export const hasAllowedRole = (allowedRoles) => {
  const role = getCurrentRole();
  if (!role) {
    return false;
  }

  return allowedRoles.some((r) => r.toLowerCase() === role.toLowerCase());
};

export const canManageChecklists = () => {
  return getCurrentRole()?.toLowerCase() === ADMIN_ROLE.toLowerCase();
};
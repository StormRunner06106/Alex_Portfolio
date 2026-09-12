const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": options.body instanceof File ? "application/octet-stream" : "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      // Keep the friendly fallback when a proxy or server returns non-JSON.
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const getProfile = (signal) => request("/api/profile", { signal });
export const getExperience = (signal) => request("/api/experience", { signal });
export const getSkills = (signal) => request("/api/skills", { signal });
export const getPosts = (signal) => request("/api/posts", { signal });
export const getPost = (slug, signal) => request(`/api/posts/${slug}`, { signal });
export const mediaUrl = (media) => `${API_BASE}${media.url}`;
export const uploadMedia = (file, purpose, token) => request(`/api/uploads?name=${encodeURIComponent(file.name)}&purpose=${purpose}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: file,
});
export const loginAdmin = (password) =>
  request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
export const getAdminSession = (token, signal) =>
  request("/api/auth/session", {
    signal,
    headers: { Authorization: `Bearer ${token}` },
  });
export const createPost = (payload, token) =>
  request("/api/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
export const sendContactMessage = (payload) =>
  request("/api/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });

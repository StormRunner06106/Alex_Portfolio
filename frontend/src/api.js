const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let detail = "Something went wrong. Please try again.";
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // Keep the friendly fallback when a proxy or server returns non-JSON.
    }
    throw new Error(detail);
  }

  return response.json();
}

export const getProfile = (signal) => request("/api/profile", { signal });
export const getExperience = (signal) => request("/api/experience", { signal });
export const getSkills = (signal) => request("/api/skills", { signal });
export const getPosts = (signal) => request("/api/posts", { signal });
export const getPost = (slug, signal) => request(`/api/posts/${slug}`, { signal });
export const sendContactMessage = (payload) =>
  request("/api/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });


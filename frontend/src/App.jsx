import { useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { getProfile } from "./api";
import Layout from "./components/Layout";
import AboutPage from "./pages/AboutPage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import ContactPage from "./pages/ContactPage";
import ExperiencePage from "./pages/ExperiencePage";
import JournalAdminPage from "./pages/JournalAdminPage";
import NotFoundPage from "./pages/NotFoundPage";
import SkillsPage from "./pages/SkillsPage";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}

export default function App() {
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getProfile(controller.signal)
      .then(setProfile)
      .catch((error) => {
        if (error.name !== "AbortError") setProfileError(error.message);
      });
    return () => controller.abort();
  }, []);

  return (
    <Layout profile={profile}>
      <ScrollToTop />
      <Routes>
        <Route
          path="/"
          element={<AboutPage error={profileError} profile={profile} />}
        />
        <Route path="/experience" element={<ExperiencePage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/manage" element={<JournalAdminPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route
          path="/contact"
          element={<ContactPage error={profileError} profile={profile} />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

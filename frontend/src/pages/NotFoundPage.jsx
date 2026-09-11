import { Link } from "react-router-dom";
import Icon from "../components/Icon";

export default function NotFoundPage() {
  return (
    <section className="not-found container">
      <p className="eyebrow">404 · Off the map</p>
      <h1>This page took a different path.</h1>
      <p>The link may be old, or the page may have moved.</p>
      <Link className="button button--primary" to="/">Return home <Icon name="arrow" size={18} /></Link>
    </section>
  );
}

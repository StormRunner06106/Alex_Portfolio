const paths = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  moon: <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z" />,
  grip: <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" strokeWidth="3" />,
  upload: <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />,
  photo: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-6 4 4 3-3 5 5" /></>,
  file: <><path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8M8 17h5" /></>,
  up: <path d="m6 14 6-6 6 6" />,
  down: <path d="m6 10 6 6 6-6" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  arrowLeft: <path d="m11 17-5-5 5-5m-5 5h13" />,
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  code: <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-2-9-4 12" />,
  email: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  github: (
    <path d="M15 22v-3.9c.04-1-.35-1.75-.9-2.25 3-.34 6.15-1.48 6.15-6.68A5.2 5.2 0 0 0 18.86 5.5a4.85 4.85 0 0 0-.13-3.63S17.64 1.52 15 3.27a12.5 12.5 0 0 0-6 0C6.36 1.52 5.27 1.87 5.27 1.87a4.85 4.85 0 0 0-.13 3.63 5.2 5.2 0 0 0-1.39 3.67c0 5.19 3.15 6.34 6.14 6.68-.44.4-.77.98-.86 1.7-.78.35-2.74.95-3.95-1.13-.25-.4-.86-1.38-1.76-1.36-.96.02-.39.55.01.77.65.36 1.1 1.74 1.24 2.17.22.63.94 1.83 4.42 1.32V22" />
  ),
  linkedin: (
    <>
      <path d="M7 9v10M7 5.5v.01M11 19v-5.5a4 4 0 0 1 8 0V19M11 9v10" />
      <rect x="3" y="3" width="18" height="18" rx="4" />
    </>
  ),
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  logout: <path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5m4-4 3-3-3-3m3 3H8" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <path d="m20 20-4.35-4.35m2.35-5.15a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />,
  send: <path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Zm-11.3 10.3L14 9" />,
  spark: <path d="M12 2c.6 5.4 3.6 8.4 9 9-5.4.6-8.4 3.6-9 9-.6-5.4-3.6-8.4-9-9 5.4-.6 8.4-3.6 9-9Z" />,
  spotify: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 9.5c3.5-1 7.3-.6 10 1M8.3 12.5c2.8-.7 6-.4 8.4.8M9 15.3c2.2-.5 4.6-.2 6.6.8" />
    </>
  ),
  steam: (
    <>
      <circle cx="15.5" cy="8.5" r="3.5" />
      <circle cx="7" cy="16.5" r="2.5" />
      <path d="m9 15 3.7-2.4 2.8-.6M4.8 15.3 2.5 14" />
    </>
  ),
};

export default function Icon({ name, size = 20, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  );
}

const paths = {
  pulse: <path d="M2 12h4l3-8 4 16 3-12 2 4h4" />,
  home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
  mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
  upload: <><path d="M7 17H6a4 4 0 0 1-.6-7.95A7 7 0 0 1 19 8a4.5 4.5 0 0 1 0 9h-2M12 21V11m-4 4 4-4 4 4" /></>,
  file: <><path d="M14 2H5v20h14V7Z" /><path d="M14 2v6h5M8 12h8m-8 4h6" /></>,
  sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" /><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6Z" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  check: <path d="m5 12 4 4L19 6" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z" /><path d="m8 12 3 3 5-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 18 17" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  headphones: <><path d="M4 14v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="12" width="4" height="8" rx="2" /><rect x="17" y="12" width="4" height="8" rx="2" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" /></>,
  alert: <><path d="m12 3 10 18H2Z" /><path d="M12 9v5m0 3v.1" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
  book: <><path d="M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15" /></>,
}

export default function Icon({ name, size = 20, className = '', ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>{paths[name] || paths.pulse}</svg>
}

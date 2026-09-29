import type { SVGProps } from 'react';

/**
 * Small inline stroke-icon set (24px grid). Kept in-repo so the site needs no
 * icon dependency. Icons are decorative by default (aria-hidden); pass a
 * `title` when an icon carries meaning on its own.
 */

const PATHS = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19c.4-3 2.7-4.8 5.5-4.8s5.1 1.8 5.5 4.8" />
      <path d="M15.5 5.7a3 3 0 010 5.6M17.5 14.5c1.7.5 2.8 2 3 4.2" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.6" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9" />
      <path d="M4.5 15v2.5a2 2 0 002 2h11a2 2 0 002-2V15" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
      <path d="M8 9.5h8M8 12h8M8 14.5h5" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" />
      <path d="M3.5 12.2L12 16.7l8.5-4.5M3.5 16.2L12 20.7l8.5-4.5" />
    </>
  ),
  compare: (
    <>
      <path d="M4 8h13M13.5 4.5L17 8l-3.5 3.5" />
      <path d="M20 16H7M10.5 12.5L7 16l3.5 3.5" />
    </>
  ),
  chat: (
    <>
      <path d="M4.5 6.5a2.5 2.5 0 012.5-2.5h10a2.5 2.5 0 012.5 2.5v7a2.5 2.5 0 01-2.5 2.5H11l-4.5 3.5V16H7a2.5 2.5 0 01-2.5-2.5v-7z" />
      <path d="M9 9.5h6M9 12.2h3.5" />
    </>
  ),
  trend: (
    <>
      <path d="M3.5 18.5l5.2-5.6 3.6 3L20 7.5" />
      <path d="M15 7.5h5v5" />
    </>
  ),
  pattern: (
    <>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="17.5" r="2.2" />
      <path d="M7.9 8.2l8.2-1.2M7.2 8.9l3.6 6.6M16.9 7.9l-3.8 7.7" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 17.5h6M10 20.5h4" />
      <path d="M12 3.5a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2v.1h5v-.1c0-.8.4-1.5 1-2A6 6 0 0012 3.5z" />
    </>
  ),
  evidence: (
    <>
      <path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 19V5A1.5 1.5 0 017 3.5z" />
      <path d="M14 3.5V8h4.5M9 13.5l2 2 4-4.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2l7 2.6v5.5c0 4.4-2.9 7.9-7 9.5-4.1-1.6-7-5.1-7-9.5V5.8l7-2.6z" />
      <path d="M8.8 12l2.2 2.2 4.3-4.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" />
      <path d="M8 10.5V8a4 4 0 018 0v2.5M12 14.5v2.2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  badge: (
    <>
      <circle cx="12" cy="9.5" r="5" />
      <path d="M9 14l-1.5 6.5L12 18l4.5 2.5L15 14" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.8 8.2l-2 5.6-5.6 2 2-5.6 5.6-2z" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.4" />
      <path d="M9 7.5V6a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0115 6v1.5M3.5 13h17" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.4" />
      <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
    </>
  ),
  building: (
    <>
      <path d="M5 20.5V6.5a1.5 1.5 0 011.5-1.5h6A1.5 1.5 0 0114 6.5v14M14 10.5h3.5A1.5 1.5 0 0119 12v8.5M3.5 20.5h17" />
      <path d="M8.5 9h2M8.5 12.5h2M8.5 16h2" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 19V5A1.5 1.5 0 017 3.5z" />
      <path d="M14 3.5V8h4.5M8.5 13h7M8.5 16h5" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.3-4.2A8 8 0 1112 20a8 8 0 01-3.9-1L4 20z" />
      <path d="M9.2 8.8c.2 2.6 2.4 5 5.3 5.6l1-1.3-1.9-1-.8.6a3.8 3.8 0 01-1.7-1.6l.6-.8-.9-1.9-1.6.4z" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.5h5M10.5 3.5v5.2L5.6 17a2 2 0 001.7 3h9.4a2 2 0 001.7-3l-4.9-8.3V3.5" />
      <path d="M8 14.5h8" />
    </>
  ),
  pill: (
    <>
      <rect x="3.6" y="8.6" width="16.8" height="6.8" rx="3.4" transform="rotate(-40 12 12)" />
      <path d="M9.6 9.6l4.8 4.8" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.6" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="M4.5 17.5l4.6-4.2 3.4 3 3-2.6 4.5 3.8" />
    </>
  ),
  consult: (
    <>
      <circle cx="9.5" cy="8" r="3.3" />
      <path d="M3.5 19.5c.4-3.2 2.8-5.2 6-5.2 1.3 0 2.5.3 3.4.9" />
      <path d="M15.5 17l2 2 3.5-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.6" />
      <path d="M8 3.5v4M16 3.5v4M4 10.5h16" />
    </>
  ),
  heart: (
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.4a4.3 4.3 0 017.5 2.4C19.5 15.4 12 20 12 20z" />
  ),
  arrow: <path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5" />,
  arrowDown: <path d="M12 5v14M6.5 13.5L12 19l5.5-5.5" />,
  check: <path d="M5 12.8l4.6 4.5L19 7.2" />,
  chevron: <path d="M6.5 9.5L12 15l5.5-5.5" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8.5 5.8v12.4a.8.8 0 001.2.7l10-6.2a.8.8 0 000-1.4l-10-6.2a.8.8 0 00-1.2.7z" />,
  pulse: <path d="M3 12h4l2.2-5.5 3.6 11 2.4-5.5H21" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: IconName;
  size?: number;
  title?: string;
};

export function Icon({ name, size = 22, title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}

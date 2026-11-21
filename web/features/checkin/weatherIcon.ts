export function weatherIcon(code?: number, isDay = 1) {
  const sun = '<circle cx="9" cy="9" r="3"/><path d="M9 2v2m0 10v2M2 9h2m10 0h2M4 4l1.4 1.4m7.2 7.2L14 14M4 14l1.4-1.4m7.2-7.2L14 4"/>'
  const cloud = '<path d="M6 16a4 4 0 0 1 .3-8 5 5 0 0 1 9.4 1A3.5 3.5 0 1 1 17 16H6Z"/>'
  let shape = '<path d="M12 22s7-6.8 7-13a7 7 0 1 0-14 0c0 6.2 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/>'
  if (code === 0 || code === 1) shape = isDay ? '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>' : '<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>'
  else if (code === 2) shape = sun + '<path d="M9 19a3.5 3.5 0 0 1 0-7 4.5 4.5 0 0 1 8.5 1A3 3 0 1 1 18 19H9Z"/>'
  else if (code === 3) shape = cloud
  else if (code === 45 || code === 48) shape = cloud + '<path d="M4 20h16M7 23h10"/>'
  else if (code && code >= 95) shape = cloud + '<path d="m13 16-3 4h4l-3 4"/>'
  else if (code && [71,73,75,77,85,86].includes(code)) shape = cloud + '<path d="M7 19v4m-2-2h4m8-2v4m-2-2h4"/>'
  else if (code && [51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) shape = cloud + '<path d="m8 19-2 4m8-4-2 4m8-4-2 4"/>'
  return '<svg viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shape + '</svg>'
}

/**
 * Official Sprout social links. Not decided yet — leave empty strings; any empty link is hidden
 * everywhere on the site. Fill these in once the accounts exist.
 */
export const social = {
  x: '',
  telegram: '',
  telegramZh: '',
  github: '',
  email: '',
} as const;

export type SocialKey = keyof typeof social;

export const socialLinks = (Object.keys(social) as SocialKey[])
  .filter((k) => social[k].trim() !== '')
  .map((k) => ({ key: k, href: k === 'email' ? `mailto:${social[k]}` : social[k] }));

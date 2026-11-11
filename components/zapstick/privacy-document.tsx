'use client';

import {ArrowLeft,ExternalLink,Mail} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {LanguageSwitcher} from '@/components/language-switcher';
import {privacyConfig,privacySections,backgroundPrivacySection,legalSections,privacySources} from '@/lib/privacy/content';

export function PrivacyDocument({kind}:{kind:'privacy'|'legal'}){
  const {locale,t}=usePreferences(),isPrivacy=kind==='privacy';
  const sections=isPrivacy?[...privacySections,backgroundPrivacySection]:legalSections;
  return <article className="legal-document" id="main-content" tabIndex={-1}>
    <div className="legal-toolbar"><a className="legal-back" href={`/${locale}`}><ArrowLeft size={17} aria-hidden="true"/>{t('Retour à Zapstick')}</a><LanguageSwitcher/></div>
    <header><span className="section-label">Zapstick</span><h1>{t(isPrivacy?'Confidentialité':'Mentions légales')}</h1><p>{t(isPrivacy?'Comprendre ce qui reste sur ton appareil et ce qui est transmis aux services externes.':'Informations sur l’éditeur et l’utilisation du service.')}</p></header>
    <section className="legal-publisher" aria-labelledby="publisher-heading"><h2 id="publisher-heading">{t('Éditeur et contact')}</h2><dl><div><dt>{t('Éditeur')}</dt><dd>{privacyConfig.operatorName}</dd></div><div><dt>{t('Pays')}</dt><dd>{privacyConfig.operatorCountry}</dd></div>{privacyConfig.operatorAddress?<div><dt>{t('Adresse de l’éditeur')}</dt><dd>{privacyConfig.operatorAddress}</dd></div>:null}{privacyConfig.operatorLegalStatus?<div><dt>{t('Statut juridique')}</dt><dd>{privacyConfig.operatorLegalStatus}</dd></div>:null}{privacyConfig.operatorRegistration?<div><dt>{t('Immatriculation')}</dt><dd>{privacyConfig.operatorRegistration}</dd></div>:null}{privacyConfig.publicationDirector?<div><dt>{t('Direction de la publication')}</dt><dd>{privacyConfig.publicationDirector}</dd></div>:null}<div><dt>{t('Contact confidentialité')}</dt><dd><a href={`mailto:${privacyConfig.privacyEmail}`}><Mail size={15} aria-hidden="true"/>{privacyConfig.privacyEmail}</a></dd></div></dl></section>
    {sections.map(section=><section key={section.title}><h2>{t(section.title)}</h2><p>{t(section.body)}</p>{section.title==='Hébergement'&&privacyConfig.hosting?<p className="legal-configured-hosting">{privacyConfig.hosting}</p>:null}</section>)}
    {isPrivacy?<nav className="legal-resources" aria-label={t('Ressources sur la protection des données')}><a href={privacySources.cookies} target="_blank" rel="noreferrer">{t('Cookies et préférences — CNIL')}<ExternalLink size={14} aria-hidden="true"/></a><a href={privacySources.rights} target="_blank" rel="noreferrer">{t('Exercer ses droits — CNIL')}<ExternalLink size={14} aria-hidden="true"/></a><a href={privacySources.complaint} target="_blank" rel="noreferrer">{t('Adresser une réclamation à la CNIL')}<ExternalLink size={14} aria-hidden="true"/></a></nav>:null}
    <footer><a href={`/${locale}/${isPrivacy?'legal':'privacy'}`}>{t(isPrivacy?'Mentions légales':'Confidentialité')}<span aria-hidden="true"> →</span></a><a href={`/${locale}`}>{t('Ouvrir l’atelier')}<span aria-hidden="true"> →</span></a></footer>
  </article>;
}

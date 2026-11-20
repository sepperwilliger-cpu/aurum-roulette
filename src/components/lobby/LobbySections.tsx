import { MAX_PLAYERS, START_BALANCE } from '@/lib/constants';
import { IconDice, IconShield, IconUser, IconUsers } from './icons';

const fmt = (n: number) => n.toLocaleString('de-CH');

function SectionHead({ id, title, lead }: { id: string; title: string; lead: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={`${id}-titel`} className="font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,3rem)] leading-[1.08] text-[#f2ead6]">
        {title}
      </h2>
      <p className="mt-3 text-[17px] leading-relaxed text-stone-400">{lead}</p>
    </div>
  );
}

const STEPS = [
  { t: 'Profil anlegen', d: 'Name wählen, Bild aus der Galerie oder ein Emoji – fertig. Kein Konto, kein Passwort.' },
  { t: 'Raum erstellen', d: 'Du bekommst einen Code wie 9K333E oder wählst einen eigenen. Schick ihn deinen Freunden.' },
  { t: 'Setzen und drehen', d: `Alle setzen gleichzeitig, 20 Sekunden lang. Dann dreht das Rad – für alle dasselbe Ergebnis.` },
];

const FEATURES = [
  { t: `Bis zu ${MAX_PLAYERS} Spieler pro Tisch`, d: 'Wer später kommt, schaut zu und steigt ein, sobald ein Platz frei wird.' },
  { t: 'Echtes 3D-Rad', d: 'Die Kugel rollt, springt über die Rauten und fällt genau in das gezogene Fach.' },
  { t: 'Alle Wetten des europäischen Roulettes', d: 'Plein, Cheval, Transversale, Carré, Sixain, Dutzende, Kolonnen und einfache Chancen.' },
  { t: 'Chat, Rangliste und Statistik', d: 'Wer liegt vorne, welche Zahlen sind heiss, wie lief deine letzte Runde?' },
  { t: 'Räume, die bleiben', d: 'Ein Code gilt für immer. Guthaben und Verlauf sind beim nächsten Mal noch da.' },
  { t: 'Im Browser, auch auf dem Handy', d: 'Nichts installieren. Auf dem Smartphone steht der Tisch hochkant.' },
];

const FAQ = [
  { q: 'Kostet das etwas?', a: 'Nein. Das Spiel ist kostenlos und es gibt nichts zu kaufen.' },
  {
    q: 'Kann man echtes Geld gewinnen oder verlieren?',
    a: `Nein. Alle spielen mit virtuellen Credits ohne Geldwert. Jeder startet mit ${fmt(START_BALANCE)} Credits; Einzahlungen, Auszahlungen und Preise gibt es nicht.`,
  },
  { q: 'Was passiert, wenn mein Guthaben auf 0 fällt?', a: `Am Tisch erscheint ein Knopf, der dir sofort wieder ${fmt(START_BALANCE)} Credits gibt. Deine Statistik bleibt erhalten.` },
  { q: 'Wie lade ich Freunde ein?', a: 'Klick im Raum oben auf den Code – der Einladungslink wird kopiert. Oder sag ihnen einfach den Code, den sie hier auf der Startseite eingeben.' },
  { q: 'Warum dauert der erste Aufruf manchmal fast eine Minute?', a: 'Der Server schläft, wenn eine Weile niemand spielt, und wacht beim ersten Besuch auf. Danach läuft alles flüssig.' },
  { q: 'Kann ich auf einem anderen Gerät weiterspielen?', a: 'Dein Profil ist an diesen Browser gebunden. Auf einem anderen Gerät legst du ein neues Profil an; Räume und Codes funktionieren überall.' },
];

export function LobbySections() {
  return (
    <>
      {/* So funktioniert's – echte Reihenfolge, darum nummeriert */}
      <section id="ablauf" aria-labelledby="ablauf-titel" className="scroll-mt-24 border-t border-white/[.06] py-24">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <SectionHead id="ablauf" title="In drei Schritten am Tisch" lead="Vom Öffnen der Seite bis zur ersten Drehung dauert es keine Minute." />
          <ol className="relative mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            <span aria-hidden="true" className="absolute left-6 right-6 top-6 hidden h-px bg-gradient-to-r from-[#d4af37]/60 via-[#d4af37]/25 to-transparent md:block" />
            {STEPS.map((s, i) => (
              <li key={s.t} className="relative">
                <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-[#d4af37]/60 bg-[#0d0b08] font-[family-name:var(--font-display)] text-xl text-[#f3d77a]">
                  {i + 1}
                </span>
                <h3 className="mt-5 text-xl font-semibold text-[#f2ead6]">{s.t}</h3>
                <p className="mt-2 max-w-sm leading-relaxed text-stone-400">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" aria-labelledby="features-titel" className="scroll-mt-24 border-t border-white/[.06] py-24">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHead
            id="features"
            title="Ein Casinoabend, ohne dass jemand Geld verliert"
            lead="Alles, was einen Roulettetisch ausmacht – nur dass ihr dafür nicht im selben Raum sitzen müsst."
          />
          <dl className="grid gap-x-10 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.t} className="border-t border-white/[.08] py-5">
                <dt className="font-semibold text-[#f2ead6]">{f.t}</dt>
                <dd className="mt-1.5 leading-relaxed text-stone-400">{f.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="sicherheit" aria-labelledby="sicherheit-titel" className="scroll-mt-24 border-t border-white/[.06] py-24">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
          <SectionHead id="sicherheit" title="Fair, privat und nur Spielgeld" lead="Damit ein Spiel unter Freunden auch eins bleibt." />
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {[
              {
                icon: IconDice,
                t: 'Nur virtuelle Credits',
                d: 'Kein Echtgeld, keine Käufe, keine Kryptowährung, keine Preise. Credits lassen sich nirgends eintauschen.',
              },
              {
                icon: IconShield,
                t: 'Nachprüfbar faires Ergebnis',
                d: 'Der Server zieht die Zahl mit einem sicheren Zufallsgenerator und veröffentlicht vor der Runde einen Prüf-Hash. Nach dem Drehen lässt sich kontrollieren, dass nichts geändert wurde.',
              },
              {
                icon: IconUser,
                t: 'Kaum Daten',
                d: 'Gespeichert werden nur Name, Bild oder Emoji, Guthaben und Spielverlauf. Keine E-Mail, kein Passwort.',
              },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t}>
                <Icon className="h-8 w-8 text-[#e9c96a]" />
                <h3 className="mt-4 text-lg font-semibold text-[#f2ead6]">{t}</h3>
                <p className="mt-2 leading-relaxed text-stone-400">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-titel" className="scroll-mt-24 border-t border-white/[.06] py-24">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHead id="faq" title="Häufige Fragen" lead="Kurz beantwortet." />
          <div className="divide-y divide-white/[.08] border-y border-white/[.08]">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-1">
                <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 text-[17px] font-medium text-[#f2ead6] [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden="true" className="text-2xl leading-none text-[#d4af37] transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="max-w-[62ch] pb-5 leading-relaxed text-stone-400">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[.06] py-10">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-2 px-5 text-sm text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>AURUM Roulette – ein Spiel unter Freunden.</span>
          <span className="flex items-center gap-2">
            <IconUsers className="h-4 w-4" /> Nur virtuelles Spielgeld, kein Glücksspiel um echtes Geld.
          </span>
        </div>
      </footer>
    </>
  );
}

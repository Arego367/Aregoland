import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar.json';
import bg from './locales/bg.json';
import cs from './locales/cs.json';
import da from './locales/da.json';
import de from './locales/de.json';
import el from './locales/el.json';
import en from './locales/en.json';
import es from './locales/es.json';
import et from './locales/et.json';
import fi from './locales/fi.json';
import fr from './locales/fr.json';
import hr from './locales/hr.json';
import hu from './locales/hu.json';
import it from './locales/it.json';
import lt from './locales/lt.json';
import lv from './locales/lv.json';
import mt from './locales/mt.json';
import nl from './locales/nl.json';
import no from './locales/no.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import sk from './locales/sk.json';
import sl from './locales/sl.json';
import sv from './locales/sv.json';
import uk from './locales/uk.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ar: { translation: ar },
      bg: { translation: bg },
      cs: { translation: cs },
      da: { translation: da },
      de: { translation: de },
      el: { translation: el },
      en: { translation: en },
      es: { translation: es },
      et: { translation: et },
      fi: { translation: fi },
      fr: { translation: fr },
      hr: { translation: hr },
      hu: { translation: hu },
      it: { translation: it },
      lt: { translation: lt },
      lv: { translation: lv },
      mt: { translation: mt },
      nl: { translation: nl },
      no: { translation: no },
      pl: { translation: pl },
      pt: { translation: pt },
      ro: { translation: ro },
      ru: { translation: ru },
      sk: { translation: sk },
      sl: { translation: sl },
      sv: { translation: sv },
      uk: { translation: uk },
    },
    lng: 'de',
    fallbackLng: 'de',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

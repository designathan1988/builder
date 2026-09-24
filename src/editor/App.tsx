import { PRODUCT_NAME } from '../config/product.ts';
import { DEFAULT_LOCALE } from '../generated/ids.ts';
import { translate } from '../i18n/index.ts';
import './app.css';

export function App() {
  return (
    <main className="app" aria-label={translate(DEFAULT_LOCALE, 'editor.label')}>
      <h1 className="app__title">{PRODUCT_NAME}</h1>
    </main>
  );
}

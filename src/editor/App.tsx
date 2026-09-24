import { PRODUCT_NAME } from '../config/product.ts';
import { t } from '../i18n/index.ts';
import './app.css';

export function App() {
  return (
    <main className="app" aria-label={t('editor.label')}>
      <h1 className="app__title">{PRODUCT_NAME}</h1>
    </main>
  );
}

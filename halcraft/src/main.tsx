// ハルクラ — エントリーポイント

import { createRoot } from 'react-dom/client';
import App from './App';
import { registerClientTelemetry } from './utils/clientTelemetry';
import './index.css';

registerClientTelemetry();

createRoot(document.getElementById('root')!).render(<App />);

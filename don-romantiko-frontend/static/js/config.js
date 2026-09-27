/**
 * DOÑA ROMANTIKA - Configuration & API Base
 */

export const API_BASE = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '5000'))
  ? 'http://localhost:5000'
  : '';


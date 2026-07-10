// Opciones de la sesión cifrada (iron-session).
// Sin imports de next/headers aquí: este archivo lo usa también el middleware (edge).
export const sessionOptions = {
  password: process.env.SESSION_SECRET || '',
  cookieName: 'ingreso_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // en prod exige HTTPS
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 h — cubre un turno de bodega sin re-loguear
    path: '/',
  },
};

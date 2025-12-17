
import dotenv from 'dotenv';
dotenv.config();

export function sessionConfig(SQLiteStore) {
  return {
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: './data' }),
    secret: process.env.SESSION_SECRET || 'supersecret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  };
}

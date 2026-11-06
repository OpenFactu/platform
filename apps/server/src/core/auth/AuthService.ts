import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const SECRET = process.env.JWT_SECRET || 'super-secret-key';

export class AuthService {
  /**
   * Genera un token JWT para un usuario.
   */
  public static generateToken(payload: any, opts?: { expiresIn?: number }): string {
    // `expiresIn` en segundos; sin él, 24 h como siempre.
    return jwt.sign(payload, SECRET, { expiresIn: opts?.expiresIn ?? '24h' });
  }

  /**
   * Verifica un token JWT.
   */
  public static verifyToken(token: string): any {
    try {
      return jwt.verify(token, SECRET);
    } catch (e) {
      return null;
    }
  }

  /**
   * Hashea una contraseña.
   */
  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Verifica una contraseña contra un hash.
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

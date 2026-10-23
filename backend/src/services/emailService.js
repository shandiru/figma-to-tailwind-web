import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export const emailService = {
  async sendVerification(email, code) {
    if (!env.emailUser || !env.emailPass) throw new ApiError(503, 'Verification email is temporarily unavailable. Try again later.');
    const transport = nodemailer.createTransport({
      host: env.smtpHost, port: env.smtpPort, secure: env.smtpPort === 465,
      requireTLS: true, auth: { user: env.emailUser, pass: env.emailPass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    try {
      await transport.sendMail({
        from: { name: 'Frame to Code', address: env.emailUser }, to: email,
        subject: 'Verify your Frame to Code email',
        text: `Your Frame to Code verification code is ${code}.\n\nIt expires in 10 minutes and can only be used once. Do not share this code.\n\nIf you did not create an account, you can ignore this email.`,
      });
    } catch {
      // SMTP errors may contain account details. Never send or log their payload.
      throw new ApiError(503, 'We could not send your verification email. Please try again later.');
    } finally { transport.close(); }
  },
};

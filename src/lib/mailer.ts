import nodemailer from "nodemailer";

/**
 * Shared nodemailer transporter for Dillon
 * Uses Gmail SMTP with the app password stored in EMAIL_PASS env var.
 */
export const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

export const FROM_EMAIL = `Dillon <${process.env.EMAIL_USER || "dillon@dillon.is"}>`;
export const BCC_EMAIL = process.env.EMAIL_USER || "dillon@dillon.is";

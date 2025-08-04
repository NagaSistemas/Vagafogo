// emailService.ts
import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465, // Use 465 para SSL ou 587 para TLS
  secure: true, // true para 465, false para 587
  auth: {
    user: "financeiro@nagasistemas.com", // Seu e-mail
    pass: "Naga@1327",          // A senha da conta de e-mail
  },
});

export async function enviarEmailConfirmacao({
  nome,
  email,
  atividade,
  data,
  horario,
  participantes,
}: {
  nome: string;
  email: string;
  atividade: string;
  data: string;
  horario: string;
  participantes: number;
}) {
  await transporter.sendMail({
    from: `"Vagafogo Reservas" <financeiro@nagasistemas.com>`,
    to: email,
    subject: "Confirmação de Reserva",
    html: `
      <h2>Olá, ${nome}!</h2>
      <p>Recebemos sua reserva para a atividade <strong>${atividade}</strong>.</p>
      <p><strong>Data:</strong> ${data} <br />
         <strong>Horário:</strong> ${horario} <br />
         <strong>Participantes:</strong> ${participantes}</p>
      <p>Aguardamos você! 🌳</p>
    `,
  });

  console.log(`📧 E-mail enviado para ${email}`);
}

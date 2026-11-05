import { PrismaClient } from "@prisma/client";

// Une seule instance partagée par toute l'application.
export const prisma = new PrismaClient();

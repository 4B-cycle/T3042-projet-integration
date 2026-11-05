// Données de test :  npm run db:seed
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if ((await prisma.cours.count()) === 0) {
    await prisma.cours.createMany({
      data: [
        { titre: "Le modèle OSI", matiere: "réseau", resume: "Les 7 couches du modèle OSI et le rôle de chacune." },
        { titre: "Adressage IPv4 et masques de sous-réseau", matiere: "réseau", resume: "Notation CIDR, calcul de masques et découpage en sous-réseaux." },
        { titre: "Introduction à SQL", matiere: "base de données", resume: "SELECT, WHERE, JOIN et GROUP BY." },
      ],
    });
  }
  if ((await prisma.exercice.count()) === 0) {
    await prisma.exercice.createMany({
      data: [
        { matiere: "réseau", niveau: 1, enonce: "Écris le masque de sous-réseau correspondant à /24 en notation décimale pointée." },
        { matiere: "réseau", niveau: 2, enonce: "Calcule le masque correspondant à /26 et le nombre d'hôtes utilisables." },
        { matiere: "réseau", niveau: 3, enonce: "Découpe 192.168.10.0/24 en 4 sous-réseaux de même taille et donne la plage de chacun." },
        { matiere: "base de données", niveau: 1, enonce: "Écris une requête SELECT qui affiche tous les étudiants dont le nom commence par « M »." },
      ],
    });
  }
}

main().finally(() => prisma.$disconnect());

-- CreateTable
CREATE TABLE "etudiant" (
    "id" SERIAL NOT NULL,
    "openwebui_id" TEXT NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etudiant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rappel" (
    "id" SERIAL NOT NULL,
    "etudiant_id" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "date_heure" TIMESTAMP(0) NOT NULL,
    "uid_externe" TEXT,
    "palier_notifie" INTEGER,

    CONSTRAINT "rappel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda" (
    "id" SERIAL NOT NULL,
    "etudiant_id" INTEGER NOT NULL,
    "url_ical" TEXT NOT NULL,
    "sujet_ntfy" TEXT NOT NULL,
    "mise_a_jour_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cours" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "matiere" TEXT NOT NULL,
    "resume" TEXT NOT NULL,

    CONSTRAINT "cours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercice" (
    "id" SERIAL NOT NULL,
    "matiere" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,
    "enonce" TEXT NOT NULL,
    "examen_id" INTEGER,

    CONSTRAINT "exercice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examen" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "matiere" TEXT NOT NULL,
    "date_prevue" TIMESTAMP(0),
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "difficulte" (
    "id" SERIAL NOT NULL,
    "etudiant_id" INTEGER NOT NULL,
    "matiere" TEXT NOT NULL,
    "notion" TEXT NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "difficulte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "etudiant_openwebui_id_key" ON "etudiant"("openwebui_id");

-- CreateIndex
CREATE INDEX "rappel_etudiant_id_date_heure_idx" ON "rappel"("etudiant_id", "date_heure");

-- CreateIndex
CREATE UNIQUE INDEX "rappel_etudiant_id_uid_externe_key" ON "rappel"("etudiant_id", "uid_externe");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_etudiant_id_key" ON "agenda"("etudiant_id");

-- CreateIndex
CREATE INDEX "cours_matiere_idx" ON "cours"("matiere");

-- CreateIndex
CREATE INDEX "exercice_matiere_niveau_idx" ON "exercice"("matiere", "niveau");

-- CreateIndex
CREATE UNIQUE INDEX "difficulte_etudiant_id_matiere_notion_key" ON "difficulte"("etudiant_id", "matiere", "notion");

-- AddForeignKey
ALTER TABLE "rappel" ADD CONSTRAINT "rappel_etudiant_id_fkey" FOREIGN KEY ("etudiant_id") REFERENCES "etudiant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda" ADD CONSTRAINT "agenda_etudiant_id_fkey" FOREIGN KEY ("etudiant_id") REFERENCES "etudiant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercice" ADD CONSTRAINT "exercice_examen_id_fkey" FOREIGN KEY ("examen_id") REFERENCES "examen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "difficulte" ADD CONSTRAINT "difficulte_etudiant_id_fkey" FOREIGN KEY ("etudiant_id") REFERENCES "etudiant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

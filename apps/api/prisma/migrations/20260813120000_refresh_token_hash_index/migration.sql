-- `AuthService.refresh` busca por tokenHash en cada renovación de sesión. Sin
-- índice era un recorrido secuencial de toda la tabla, y la tabla no se limpia
-- nunca: con rotación cada 15 minutos solo crece, así que la búsqueda se
-- degradaba de forma continua y silenciosa.
--
-- Único además de indexado: dos filas con el mismo hash no tienen sentido
-- (el hash viene de dos UUID v4 concatenados) y la unicidad permite usar
-- findUnique, que es lo que la consulta quiere decir de verdad.
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- Soporta el borrado periódico de tokens caducados.
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

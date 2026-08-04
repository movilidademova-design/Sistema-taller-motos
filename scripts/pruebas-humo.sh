#!/usr/bin/env bash
#
# Prueba de humo de toda la plataforma contra una API corriendo.
# Correr antes de cada despliegue:  bash scripts/pruebas-humo.sh
#
# Asume la base de datos de demostración (usuarios @tallerdemo.com con clave
# Password123! y las sucursales de abajo). Contra otra base hay que cambiar
# esos valores.
API=http://127.0.0.1:3001/api
BR_A=33255f8b-2ef5-49df-a5fe-3d3518180cde   # Calle 80
BR_B=5fb5ee5e-0558-4ca5-a162-a67feb9328d7   # Ciudadela
PASS=0; FAIL=0

login(){ curl -s -X POST $API/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$1\",\"password\":\"Password123!\"}" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4; }

# check <descripción> <esperado> <obtenido>
check(){
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "  ✓ %-52s %s\n" "$1" "$3"
  else FAIL=$((FAIL+1)); printf "  ✗ %-52s esperado %s, obtuve %s\n" "$1" "$2" "$3"; fi
}
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }

ADMIN=$(login admin@tallerdemo.com)
GER=$(login gerente@tallerdemo.com)
REC=$(login recepcion@tallerdemo.com)
TEC=$(login tecnico@tallerdemo.com)
HA=(-H "Authorization: Bearer $ADMIN" -H "X-Branch-Id: $BR_A")
HG=(-H "Authorization: Bearer $GER"   -H "X-Branch-Id: $BR_A")
HR=(-H "Authorization: Bearer $REC"   -H "X-Branch-Id: $BR_A")
HT=(-H "Authorization: Bearer $TEC"   -H "X-Branch-Id: $BR_A")

echo ""; echo "AUTENTICACIÓN Y ROLES"
check "login admin" 200 "$(code -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@tallerdemo.com","password":"Password123!"}')"
check "login con clave mala rechaza" 401 "$(code -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@tallerdemo.com","password":"ClaveIncorrecta123"}')"
check "sin token rechaza" 401 "$(code $API/orders)"

echo ""; echo "SUCURSALES"
check "listar sucursales" 200 "$(code $API/branches "${HA[@]}")"
check "sucursales del usuario" 200 "$(code $API/users/me/branches "${HA[@]}")"
check "sucursal ajena rechazada" 400 "$(code $API/orders -H "Authorization: Bearer $GER" -H "X-Branch-Id: $BR_B")"

echo ""; echo "USUARIOS"
check "admin lista usuarios" 200 "$(code $API/users "${HA[@]}")"
check "gerente lista usuarios" 200 "$(code $API/users "${HG[@]}")"
check "recepción NO lista usuarios" 403 "$(code $API/users "${HR[@]}")"
check "crear sin sucursal rechaza" 400 "$(code -X POST $API/users "${HA[@]}" -H 'Content-Type: application/json' -d '{"email":"x'"$RANDOM"'@t.com","password":"Password123!","firstName":"A","lastName":"B","role":"RECEPTIONIST"}')"

echo ""; echo "CATÁLOGOS POR SUCURSAL"
check "servicios rápidos" 200 "$(code $API/quick-services "${HA[@]}")"
check "accesorios" 200 "$(code $API/accessory-options "${HA[@]}")"

echo ""; echo "CLIENTES (compartidos entre sucursales)"
check "listar clientes" 200 "$(code $API/clients "${HA[@]}")"
DOC="CROSS-$RANDOM"
check "crear en Calle 80" 201 "$(code -X POST $API/clients "${HA[@]}" -H 'Content-Type: application/json' -d "{\"firstName\":\"Cruz\",\"lastName\":\"Prueba\",\"documentId\":\"$DOC\"}")"
check "se encuentra desde Ciudadela" 200 "$(code $API/clients/by-document/$DOC -H "Authorization: Bearer $ADMIN" -H "X-Branch-Id: $BR_B")"

echo ""; echo "ÓRDENES"
check "admin lista órdenes" 200 "$(code $API/orders "${HA[@]}")"
check "técnico ve las de su sucursal" 200 "$(code $API/orders "${HT[@]}")"
check "paginación explícita" 200 "$(code "$API/orders?page=1&pageSize=5" "${HA[@]}")"
check "pageSize fuera de rango rechaza" 400 "$(code "$API/orders?pageSize=999" "${HA[@]}")"

echo ""; echo "FOTOS"
OID=$(curl -s "$API/orders" "${HA[@]}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
PID=$(curl -s "$API/orders/$OID/photos" "${HA[@]}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
check "listar fotos" 200 "$(code $API/orders/$OID/photos "${HA[@]}")"
[ -n "$PID" ] && check "no se borra una foto de ingreso" 400 "$(code -X DELETE $API/orders/$OID/photos/$PID "${HA[@]}")"

echo ""; echo "COTIZACIONES"
check "lista de cotizaciones" 200 "$(code $API/quotations "${HA[@]}")"
check "contador de pendientes" 200 "$(code $API/quotations/pending-count "${HA[@]}")"
check "técnico NO ve cotizaciones" 403 "$(code $API/quotations "${HT[@]}")"
check "recepción SÍ ve cotizaciones" 200 "$(code $API/quotations "${HR[@]}")"

echo ""; echo "NOTIFICACIONES"
check "listar notificaciones" 200 "$(code "$API/notifications?status=PENDING" "${HA[@]}")"

echo ""; echo "INVENTARIO Y COMPRAS"
check "productos" 200 "$(code $API/inventory/products "${HA[@]}")"
check "categorías" 200 "$(code $API/inventory/categories "${HA[@]}")"
check "proveedores" 200 "$(code $API/inventory/suppliers "${HA[@]}")"
check "movimientos" 200 "$(code $API/inventory/movements "${HA[@]}")"
check "órdenes de compra" 200 "$(code $API/purchase-orders "${HA[@]}")"

echo ""; echo "FACTURAS Y AGENDA"
check "facturas" 200 "$(code $API/invoices "${HA[@]}")"
check "citas" 200 "$(code $API/appointments "${HA[@]}")"

echo ""; echo "REPORTES A EXCEL"
for e in "orders/export:órdenes" "clients/export:clientes" "invoices/export:facturas" "reports/revenue/export?groupBy=month:ingresos"; do
  ep=${e%%:*}; nm=${e##*:}
  check "export de $nm" 200 "$(code "$API/$ep" "${HA[@]}")"
done
check "técnico NO exporta" 403 "$(code $API/orders/export "${HT[@]}")"

echo ""; echo "MÓDULOS ELIMINADOS (deben dar 404)"
for m in payments warranties; do check "/$m eliminado" 404 "$(code $API/$m "${HA[@]}")"; done
OID2=$(curl -s "$API/orders" "${HA[@]}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
for m in checklist labor; do check "/orders/:id/$m eliminado" 404 "$(code $API/orders/$OID2/$m "${HA[@]}")"; done

echo ""; echo "PANEL"
check "resumen" 200 "$(code $API/dashboard/summary "${HA[@]}")"
check "gráfico de ingresos" 200 "$(code $API/dashboard/charts/revenue "${HA[@]}")"

echo ""
echo "══════════════════════════════════"
printf "  %d pasaron, %d fallaron\n" "$PASS" "$FAIL"
echo "══════════════════════════════════"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)

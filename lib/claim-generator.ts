
export interface ClaimTemplate {
    title: string;
    body: string;
}

export class ClaimGenerator {
    static generate(type: string, details: any, transaction: any): ClaimTemplate {
        const date = new Date(transaction.fecha).toLocaleDateString('es-AR');
        const amount = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Math.abs(transaction.monto));

        switch (type) {
            case 'duplicado':
                return {
                    title: `Reclamo por Transacción Duplicada - ${transaction.descripcion}`,
                    body: `Estimados,\n\nMe pongo en contacto para informar que hemos detectado un cargo duplicado en nuestra cuenta con fecha ${date} por un monto de ${amount}.\n\nDetalle de la transacción: "${transaction.descripcion}".\n\nAdjuntamos el extracto donde se visualizan ambos cargos por el mismo concepto y valor en una ventana de tiempo coincidente. Solicitamos la reversión manual del cargo excedente a la brevedad.\n\nAtentamente,\nEquipo de Tesorería.`
                };

            case 'banco':
                const expected = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(details.monto_esperado || 0);
                const real = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(details.monto_real || 0);
                return {
                    title: `Reclamo por Diferencia en Comisiones Bancarias - ${transaction.descripcion}`,
                    body: `Al oficial de cuenta,\n\nTras realizar nuestra auditoría algorítmica mensual con BiFlow, hemos detectado un desvío en las comisiones cobradas en la transacción "${transaction.descripcion}" del día ${date}.\n\n- Monto Cobrado: ${real}\n- Monto según Convenio: ${expected}\n\nEste cargo no se ajusta a las tasas pactadas en nuestro convenio vigente. Solicitamos el reintegro de la diferencia y la revisión de los parámetros de cobro en nuestro perfil.\n\nQuedamos a la espera de su confirmación.\nSaludos cordiales.`
                };

            case 'anomalia':
                return {
                    title: `Alerta de Desvío en Facturación - ${transaction.descripcion}`,
                    body: `Hola,\n\nDetectamos un incremento inusual en el gasto de "${transaction.descripcion}" registrado el ${date} por un monto de ${amount}.\n\nEste valor representa un desvío significativo respecto al promedio histórico de los últimos 3 meses para este concepto. Por favor, enviar la factura detallada o el justificativo de este incremento para nuestra auditoría interna.\n\nMuchas gracias.`
                };

            default:
                return {
                    title: `Consulta sobre Transacción - ${transaction.descripcion}`,
                    body: `Hola,\n\nEstamos revisando nuestros movimientos del día ${date} y necesitamos más información sobre la transacción: "${transaction.descripcion}" por ${amount}.\n\n¿Podrían brindarnos más detalles o copia del comprobante?\n\nGracias.`
                };
        }
    }
}

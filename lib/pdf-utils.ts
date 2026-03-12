import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function exportTreasuryMovementToPDF(movement: any) {
    const isCobro = movement.tipo === 'cobro'
    const title = isCobro ? 'RECIBO DE COBRO' : 'ORDEN DE PAGO'
    const doc = new jsPDF()

    // --- Header ---
    // Background for header
    doc.setFillColor(15, 23, 42) // Slate-900
    doc.rect(0, 0, 210, 40, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.text('BiFlow', 15, 18)
    doc.setFontSize(10)
    doc.text('Inteligencia en Gestión de Tesorería', 15, 25)

    doc.setFontSize(18)
    doc.text(title, 120, 18)
    doc.setFontSize(12)
    doc.text(`N°: ${movement.nro_comprobante || movement.nro_factura || 'S/N'}`, 120, 28)

    // --- Basic Info Section ---
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('INFORMACIÓN GENERAL', 15, 50)
    doc.line(15, 52, 60, 52)

    doc.setFont('helvetica', 'normal')
    doc.text(`Fecha: ${new Date(movement.fecha).toLocaleDateString('es-AR')}`, 15, 60)
    doc.text(`Entidad: ${movement.entidades?.razon_social || 'N/A'}`, 15, 67)
    doc.text(`CUIT: ${movement.entidades?.cuit || 'N/A'}`, 15, 74)

    doc.setFont('helvetica', 'bold')
    const montoDisplay = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(movement.monto_total)
    doc.text(`MONTO TOTAL: ${montoDisplay}`, 120, 60)

    if (movement.observaciones) {
        doc.setFont('helvetica', 'normal')
        doc.text(`Observaciones: ${movement.observaciones}`, 15, 85, { maxWidth: 180 })
    }

    // --- Instruments Table (Valores) ---
    doc.setFont('helvetica', 'bold')
    doc.text('DETALLE DE VALORES / INSTRUMENTOS', 15, 105)
    
    const instrumentsHeaders = [['Método', 'Monto', 'Disponibilidad', 'Banco', 'Referencia']]
    const instrumentsData = movement.instrumentos_pago.map((ins: any) => [
        ins.metodo.replace('_', ' ').toUpperCase(),
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(ins.monto),
        new Date(ins.fecha_disponibilidad).toLocaleDateString('es-AR'),
        ins.banco || '-',
        ins.detalle_referencia || '-'
    ])

    autoTable(doc, {
        startY: 108,
        head: instrumentsHeaders,
        body: instrumentsData,
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42] },
        styles: { fontSize: 9 }
    })

    // --- Applications Table (Imputaciones) ---
    const lastY = (doc as any).lastAutoTable.finalY || 150
    
    doc.setFont('helvetica', 'bold')
    doc.text('COMPROBANTES CANCELADOS / APLICADOS', 15, lastY + 15)

    const applicationsHeaders = [['Tipo Comprobante', 'Número', 'Monto Aplicado']]
    const applicationsData = movement.aplicaciones_pago.map((app: any) => [
        app.comprobantes?.tipo.replace('_', ' ').toUpperCase() || '-',
        app.comprobantes?.numero || '-',
        new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(app.monto_aplicado)
    ])

    autoTable(doc, {
        startY: lastY + 18,
        head: applicationsHeaders,
        body: applicationsData,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85] },
        styles: { fontSize: 9 }
    })

    // --- Footer / Signature ---
    const finalY = (doc as any).lastAutoTable.finalY || 200
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text('Documento generado automáticamente por BiFlow', 15, 280)
    doc.text(`Fecha de impresión: ${new Date().toLocaleString()}`, 15, 285)

    // Save PDF
    const filename = `${movement.nro_comprobante || 'MOV'}_${(movement.entidades?.razon_social || 'Entidad').replace(/\s/g, '_')}.pdf`
    doc.save(filename)
}

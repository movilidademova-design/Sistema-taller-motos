import { Global, Module } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { QuotationPdfService } from './quotation-pdf.service';

@Global()
@Module({
  providers: [PdfService, QuotationPdfService],
  exports: [PdfService, QuotationPdfService],
})
export class PdfModule {}

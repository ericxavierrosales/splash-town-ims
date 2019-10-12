function Transaction (id, tdate, tsales, invoice, tenderamt, change, cashier) {
    this.RowId       = ko.observable(id)
    this.TxnDate     = ko.observable(tdate)
    this.TotalSales  = ko.observable(tsales)
    this.InvoiceNum  = ko.observable(invoice)
    this.AmtTendered = ko.observable(tenderamt)
    this.Change      = ko.observable(change)
    this.Cashier     = ko.observable(cashier)

    this.selectTxnRow = function() {
        $('#selected-txn-row-id').val(this.RowId())
        $('#select-txn-row-btn').click()
        $('#selected-txn-invoice').text(': ' + this.InvoiceNum())
    }
}

module.exports = Transaction
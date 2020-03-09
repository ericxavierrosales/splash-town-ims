function Sale (id, num, name, qty, price) {
    this.RowId     = ko.observable(id)
    this.ProdNum   = ko.observable(num)
    this.ProdName  = ko.observable(name)
    this.SaleQty   = ko.observable(qty)
    this.SalePrice = ko.observable(price)

    this.UnitPrice   = this.SalePrice() / this.SaleQty()

    this.TotalAmount = ko.pureComputed(() => {
        return this.SaleQty() * this.UnitPrice
    })

}

function Sale (id, num, name, qty, price, tid) {
    this.RowId     = ko.observable(id)
    this.ProdNum   = ko.observable(num)
    this.ProdName  = ko.observable(name)
    this.SaleQty   = ko.observable(qty)
    this.SalePrice = ko.observable(price)
    this.TxnId     = ko.observable(tid)

    this.UnitPrice   = this.SalePrice() / this.SaleQty()

    this.TotalAmount = ko.pureComputed(() => {
        return this.SaleQty() * this.UnitPrice
    })

}

module.exports = Sale
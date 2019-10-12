function Sale (id, num, name, qty, price) {
    this.RowId     = ko.observable(id)
    this.ProdNum   = ko.observable(num)
    this.ProdName  = ko.observable(name)
    this.SaleQty   = ko.observable(qty)
    this.SalePrice = ko.observable(price)
}

module.exports = Sale
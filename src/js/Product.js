function Product(id, num, name, category, cname, qty, price) {
    this.RowId     = ko.observable(id)
    this.ProdNum   = ko.observable(num)
    this.ProdName  = ko.observable(name)
    this.Category  = ko.observable(category)
    this.ProdQty   = ko.observable(qty)
    this.ProdPrice = ko.observable(price)
    this.IsEnabled = ko.observable(false)
    this.IsRestock = ko.observable(false)

    this.CategoryName = ko.observable(cname)

    this.selectSalesRow = () => {
        $('#sales-prod-id').val(this.RowId())
        $('#sales-prod-qty').val('')
        $('#sale-qty-modal').modal('toggle')
    }

    this.editRow = () => {
        this.IsEnabled(!this.IsEnabled())
    }

    this.cancelAction = () => {
        $('#pname-' + this.RowId()).val(this.ProdName())
        $('#pprice-' + this.RowId()).val(this.ProdPrice().toFixed(2))
        $('#pqty-' + this.RowId()).val(this.ProdQty())
        this.IsEnabled(false)
        this.IsRestock(false)
    }
}

module.exports = Product
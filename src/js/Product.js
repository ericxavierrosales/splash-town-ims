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

    this.selectSalesRow = function() {
        $('#sales-prod-id').val(this.RowId())
        $('#sales-prod-qty').val('')
        $('#sale-qty-modal').modal('toggle')
    }

    this.editRow = function() {
        this.IsEnabled(!this.IsEnabled())
    }

    this.saveEdit = function() {
        let oldname = this.ProdName()
        let newname = $('#pname-' + this.RowId()).val()
        let oldprice = this.ProdPrice()
        let newprice = $('#pprice-' + this.RowId()).val()
        let oldcateg = this.Category()
        let newcateg = $('#pcat-' + this.RowId()).val()

        if ((newname != oldname || newprice != oldprice || newcateg != oldcateg) && showConfirm("Save changes?")) {
            let currDateTime = new moment().format('YYYY-MM-DDTHH:mm:ss')
            this.ProdName(newname)
            this.ProdPrice(newprice)
            this.Category(newcateg)
    
            let updStmt = db.prepare(`UPDATE PRODUCT SET pname = ?, pprice = ?, category = ? WHERE rowid = ?`)
            updStmt.run(this.ProdName(), this.ProdPrice(), this.Category(), this.RowId())
            updStmt.finalize()

            // Update Inventory ledger table
            let recordStmt
            if (newname != oldname && newprice != oldprice) {
                recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, olddesc, newdesc, oldprice, newprice, reason) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
                recordStmt.run(currDateTime, this.RowId(), currentUserId, oldname, newname, oldprice, newprice, 'Product Change')
            }
            else if (newname != oldname && newprice == oldprice) {
                recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, olddesc, newdesc, reason) VALUES(?, ?, ?, ?, ?, ?)`)
                recordStmt.run(currDateTime, this.RowId(), currentUserId, oldname, newname, 'Description Change')
            }
            else if (newname == oldname && newprice != oldprice) {
                recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, oldprice, newprice, reason) VALUES(?, ?, ?, ?, ?, ?)`)
                recordStmt.run(currDateTime, this.RowId(), currentUserId, oldprice, newprice, 'Price Change')
            }
            else if (oldcateg != newcateg) {
                recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, reason) VALUES(?, ?, ?, ?)`)
                recordStmt.run(currDateTime, this.RowId(), currentUserId, 'Category changed')
            }
            recordStmt.finalize()

            ipcRenderer.send('notif:send', {
                title: 'Success!',
                message: 'Product details successfully updated!'
            })
        }
        else {
            $('#pname-' + this.RowId()).val(this.ProdName())
            $('#pprice-' + this.RowId()).val(this.ProdPrice())
            $('#pcat-' + this.RowId()).val(this.Category())
        }
        this.IsEnabled(!this.IsEnabled())
    }

    this.restockRow = function() {
        $('#restock-modal').modal('toggle')
        $('#restock-row-id').val(this.RowId())
    }

    this.cancelAction = function() {
        $('#pname-' + this.RowId()).val(this.ProdName())
        $('#pprice-' + this.RowId()).val(this.ProdPrice().toFixed(2))
        $('#pqty-' + this.RowId()).val(this.ProdQty())
        this.IsEnabled(false)
        this.IsRestock(false)
    }
}

module.exports = Product
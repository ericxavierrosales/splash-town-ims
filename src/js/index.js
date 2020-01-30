// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.
const electron      = require('electron')
const path          = require('path')
const ko            = require('knockout')
const moment        = require('moment')
const datepicker    = require('js-datepicker')
const bcrypt        = require('bcrypt')
const sqlite3       = require('sqlite3')
const XLSX          = require('xlsx')

const User          = require('../src/js/User')
const Category      = require('../src/js/Category')
const Product       = require('../src/js/Product')
const Sale          = require('../src/js/Sale')
const Transaction   = require('../src/js/Transaction')
const onScan        = require('onscan.js/onScan')

const {ipcRenderer} = electron
const {dialog}      = electron.remote
const addForm       = document.querySelector('#add-form')
const restockForm   = document.querySelector('#restock-form')
const searchForm    = document.querySelector('#search-form')
const salesForm     = document.querySelector('#sales-form')
const saSearchForm  = document.querySelector('#sales-search-form')
const addSaleForm   = document.querySelector('#sales-form-add')
const amtTenderForm = document.querySelector('#amt-tender-form')
const txnFilterForm = document.querySelector('#filter-txn-form')
const loginForm     = document.querySelector('#supervisor-login-form')
const saltRounds    = 10
const db            = new sqlite3.Database(path.join(__dirname, 'db/inventory.db'))

let currentUserId

$(document).ready(function() {
    // Datepicker
    const dtpickerFormatted = (input, date, instance) => {
        const val = new moment(date).format('MM-DD-YYYY')
        input.value = val
    }
    const frPicker = datepicker('#txn-frdate', {formatter: dtpickerFormatted})
    const toPicker = datepicker('#txn-todate', {formatter: dtpickerFormatted})

    function viewModel() {
        let self = this
        self.pageTitle   = "Splash Town"
        self.currentUser = ko.observable()
        
        // Observable arrays
        self.users            = ko.observableArray([])
        self.categories       = ko.observableArray([])
        self.products         = ko.observableArray([])
        self.srFilterProducts = ko.observableArray([])
        self.sales            = ko.observableArray([])
        self.transactions     = ko.observableArray([])
        self.transactionSales = ko.observableArray([])
        self.txnRevisions     = ko.observableArray([])
        self.stockRecords     = ko.observableArray([])
        self.salesRecords     = ko.observableArray([])
        self.salesByProduct   = ko.observableArray([])

        // Filters
        self.searchFilter    = ko.observable()
        self.txnFilterType   = ko.observable('invoice')
        self.invoiceFilter   = ko.observable()
        self.tdateFilterOp   = ko.observable('Equal')
        self.tdateFromFilter = ko.observable()
        self.tdateToFilter   = ko.observable()
        self.stockFilter     = ko.observable('all')
        self.saleProdFilter  = ko.observable()
        self.prodDynFilter   = ko.observable('')
        self.categoryFilter  = ko.observable(0)
        self.filterSalesTbl  = ko.observable(false)
        self.showAllSales    = ko.observable(true)
        self.srFilterShown   = ko.observable(false)
        self.srPnameFilter   = ko.observable(0)
        self.srCategFilter   = ko.observable(0)
        self.sdateFilterOp   = ko.observable('Equal')
        self.sdateFromFilter = ko.observable('')
        self.sdateToFilter   = ko.observable('')

        // Sorting
        self.currentSortCol  = ko.observable('pname')
        self.sortByAscending = ko.observable(true)

        // Sales 
        self.isPOSActive     = ko.observable(true)
        self.isProcessing    = ko.observable(false)
        self.amountTendered  = ko.observable(0)
        self.totalSalesPrice   = ko.pureComputed(function() {
            return self.sales().reduce(function(acc, current) {
                return acc + current.SalePrice()
            }, 0)
        })
        self.changeGiven     = ko.computed(function() {
            return (self.amountTendered() == 0) ? 0 : self.amountTendered() - self.totalSalesPrice()
        })

        // Non-observables
        self.editedTxnId      = 0
        self.editTxnAction    = ""
        self.invChangeType    = ""
        self.invChangeProduct = {}

        // Datepicker
        const frSRPicker = datepicker('#sr-frdate', {
            formatter: dtpickerFormatted,
            onSelect: (instance, date) => {
                self.sdateFromFilter(new moment(date).format('YYYY-MM-DD'))
            }
        })
        const toSRPicker = datepicker('#sr-todate', {
            formatter: dtpickerFormatted,
            onSelect: (instance, date) => {
                self.sdateToFilter(new moment(date).format('YYYY-MM-DD'))
            }
        })

        // Populate User on login
        ipcRenderer.send('login:getUser')
        ipcRenderer.on('login:returnLoggedInUser', function(e, user) {
            self.currentUser(new User(user.rowid, user.fname, user.lname, user.user, user.roleid))
            currentUserId = user.rowid

            // Get users if current user is an Administrator
            document.querySelector('#add-user-form').addEventListener('submit', function(e) {
                e.preventDefault()
                addNewUser()
            })
            db.each(`SELECT rowid, fname, lname, user, roleid FROM USER ORDER BY rowid`, function(err, row) {
                self.users.push(new User(row.rowid, row.fname, row.lname, row.user, row.roleid))
            })
        })

        // Initialize Database and fetch values
        db.serialize(function() {
            // Product Categories 
            self.categories.push(new Category(0, "All"))
            db.each(`SELECT rowid, name FROM CATEGORY`, (err, row) => {
                self.categories.push(new Category(row.rowid, row.name))
            })

            // Products Table
            self.srFilterProducts.push(new Product(0, 0, 'All', 0, 'All', 0 ,0))
            db.each(`SELECT p.rowid, p.pnumber, p.pname, p.category, c.name, p.pqty, p.pprice FROM PRODUCT p, CATEGORY c WHERE p.category = c.rowid AND p.isactive = TRUE ORDER BY p.pname`, (err, row) => {
                self.products.push(new Product(row.rowid, row.pnumber, row.pname, row.category, row.name, row.pqty, row.pprice))
                self.srFilterProducts.push(new Product(row.rowid, row.pnumber, row.pname, row.category, row.name, row.pqty, row.pprice))
            });

            // Transactions Table
            db.each(`SELECT t.rowid, t.tdate, t.totalsales, t.invoicenumber, t.tenderamt, t.change, u.fname || ' ' || u.lname AS cashier 
                     FROM TRANSACTION_RECORD t, USER u WHERE t.cashier = u.rowid AND t.status != 'Refunded'`, (err, row) => {
                self.transactions.push(new Transaction(row.rowid, row.tdate, row.totalsales, row.invoicenumber, row.tenderamt, row.change, row.cashier))
            })

            // Sales Records Table
            db.each(`SELECT s.rowid, s.sdate, p.rowid AS pid, p.pname, p.category, s.saleprice, s.saleqty, s.tid FROM SALES_RECORD s, PRODUCT p WHERE s.pid = p.rowid ORDER BY s.sdate DESC`, (err, row) => {
                self.salesRecords.push(row)
            })

            db.each(`SELECT p.rowid AS pid, p.pname, p.category AS cid, c.name AS category, SUM(s.saleprice) AS totalSales, SUM(s.saleqty) AS totalQty FROM SALES_RECORD s, PRODUCT p, CATEGORY c WHERE s.pid = p.rowid AND p.category = c.rowid GROUP BY s.pid ORDER BY s.pname`, (err, row) => {
                self.salesByProduct.push(row)
            })

            // Inventory ledger Table
            db.each(`SELECT i.rowid, i.scdate, p.pname, u.user, i.oldcount, i.newcount, i.olddesc, i.newdesc, i.oldprice, i.newprice, i.reason 
                     FROM INVENTORY_LEDGER i, PRODUCT p, USER u 
                     WHERE i.pid = p.rowid AND i.changedby = u.rowid
                     ORDER BY i.scdate DESC`, (err, row) => {
                self.stockRecords.push(row)
            })
        });

        // Filter functions
        // Sales table
        $('#select-category-trigger-btn').on('click', function() {
            self.categoryFilter($('#selected-category').val())
            if (self.categoryFilter() == 0) {
                $('#sales-search-input').val('')
                self.saleProdFilter('')
            }
        })

        $('#sales-search-input').on('keyup', (e) => {
            e.stopPropagation();
            let val = $('#sales-search-input').val()
            if (val) {
                self.prodDynFilter(val)
                $('#autocomplete-dd').dropdown('show');
            }
            else if (val == '') {
                $('#autocomplete-dd').dropdown('hide');
            }
        })

        saSearchForm.addEventListener('submit', (e) => {
            e.preventDefault()

            self.saleProdFilter($('#sales-search-input').val())
        })

        self.filterProductsDynamic = ko.computed(() => {
            return ko.utils.arrayFilter(self.products(), (product) => {
                return (product.ProdName().toLowerCase().indexOf(self.prodDynFilter().toLowerCase()) != -1) ||
                    (product.ProdNum() == self.prodDynFilter())
            })
        })

        self.filterSaleProducts = ko.computed(() => {
            if (!self.saleProdFilter() && self.categoryFilter() == 0) {
                return self.products()
            }
            else if (!self.saleProdFilter() && self.categoryFilter() != 0) {
                return ko.utils.arrayFilter(self.products(), (product) => {
                    return product.Category() == self.categoryFilter()
                })
            }
            else if (self.categoryFilter() == 0 && self.saleProdFilter()) {
                return ko.utils.arrayFilter(self.products(), (product) => {
                    return product.ProdName().toLowerCase().indexOf(self.saleProdFilter().toLowerCase()) != -1
                })
            }
            else {
                return ko.utils.arrayFilter(self.products(), (product) => {
                    return product.Category() == self.categoryFilter() && product.ProdName().toLowerCase().indexOf(self.saleProdFilter().toLowerCase()) != -1
                })
            }
        })

        // Inventory table
        self.filterProducts = ko.computed(function() {
            if (!self.searchFilter()) {
                return self.products()
            }
            else {
                return ko.utils.arrayFilter(self.products(), function(product) {
                    return (product.ProdName().toLowerCase().indexOf(self.searchFilter().toLowerCase()) !== -1) ||
                            (product.ProdNum().indexOf(self.searchFilter()) !== -1)
                })
            }
        })

        // Stock Ledger table
        self.filterStocks = ko.computed(function() {
            if (self.stockFilter() == 'all') {
                return self.stockRecords()
            }
            else if (self.stockFilter() == 'stock-changes') {
                return ko.utils.arrayFilter(self.stockRecords(), function(stock) {
                    return stock.oldcount != null
                })
            }
            else if (self.stockFilter() == 'price-changes') {
                return ko.utils.arrayFilter(self.stockRecords(), function(stock) {
                    return stock.oldprice != null
                })
            }
            else {
                return ko.utils.arrayFilter(self.stockRecords(), function(stock) {
                    return stock.olddesc != null
                })
            }
        })

        // Transactions table
        $("input[name='filterTypeOptions']").on('click', function() {
            self.txnFilterType(this.value)
            $('#txn-invoice-num').val('')
            $('#txn-frdate').val('')
            $('#txn-todate').val('')
        })

        self.filterTransactions = ko.computed(function() {
            if ((self.txnFilterType() == 'invoice' && !self.invoiceFilter()) || (self.txnFilterType() == 'tdate' && !self.tdateFromFilter() && !self.tdateToFilter())) {
                return self.transactions()
            }
            else if (self.txnFilterType() == 'invoice') {
                return ko.utils.arrayFilter(self.transactions(), function(txn) {
                    return txn.InvoiceNum() === self.invoiceFilter()
                })
            }
            else if (self.txnFilterType() == 'curmonth') {
                return ko.utils.arrayFilter(self.transactions(), function(txn) {
                    return new moment(txn.TxnDate()).isSame(new moment(), 'month')
                })
            }
            else if (self.txnFilterType() == 'curweek') {
                return ko.utils.arrayFilter(self.transactions(), function(txn) {
                    return new moment(txn.TxnDate()).isSame(new moment(), 'week')
                })
            }
            else {
                return ko.utils.arrayFilter(self.transactions(), function(txn) {
                    if (self.tdateFilterOp() == 'Equal') {
                        return new moment(txn.TxnDate()).isSame(self.tdateFromFilter(), 'day')
                    }
                    else if (self.tdateFilterOp() == 'Before') {
                        return new moment(txn.TxnDate()).isBefore(self.tdateToFilter(), 'day')
                    }
                    else if (self.tdateFilterOp() == 'After') {
                        return new moment(txn.TxnDate()).isAfter(self.tdateFromFilter(), 'day')
                    }
                    else {
                        return new moment(txn.TxnDate()).isBetween(self.tdateFromFilter(), self.tdateToFilter(), null, '[]')
                    }
                })
            }
        })

        self.createCategories = ko.pureComputed(function() {
            return ko.utils.arrayFilter(self.categories(), category => {
                return category.RowId() != 0
            })
        })

        self.clearTxnSearchForm = function() {
            self.invoiceFilter('')
            self.tdateFromFilter('')
            self.tdateToFilter('')
            self.tdateFilterOp('Equal')
            $('#txn-invoice-num').val('')
            $('#txn-frdate').val('')
            $('#txn-todate').val('')
        }

        // SALES RECORDS table
        self.toggleSrFilterShown = function() {
            self.srFilterShown(!self.srFilterShown())
        }
        
        $('#sr-category-filter').on('change', () => {
            self.srCategFilter($('#sr-category-filter').val())
        })

        $('#sr-pname-filter').on('change', () => {
            self.srPnameFilter($('#sr-pname-filter').val())
        })
        
        self.filterSalesRecords = ko.computed(function() {
            if (self.srCategFilter() == 0 && self.srPnameFilter() == 0 && self.sdateFromFilter() == '' && self.sdateToFilter() == '') {
                return self.salesRecords()
            }
            else {
                return ko.utils.arrayFilter(self.salesRecords(), (record) => {
                    return ((self.srCategFilter()!=0) ? record.category == self.srCategFilter() : 1) && 
                            ((self.srPnameFilter()!=0) ? record.pid == self.srPnameFilter() : 1) && 
                            ((self.sdateFromFilter()!=''||self.sdateToFilter()!='') ? getSrFilterCondition(self.sdateFilterOp(), record) : 1)
                })
            }
        })

        self.filterSalesByProduct = ko.computed(function() {
            if (self.srCategFilter() == 0 && self.srPnameFilter() == 0) {
                return self.salesByProduct()
            }
            else {
                return ko.utils.arrayFilter(self.salesByProduct(), (record) => {
                    return ((self.srCategFilter()!=0) ? record.cid == self.srCategFilter() : 1) && 
                            ((self.srPnameFilter()!=0) ? record.pid == self.srPnameFilter() : 1)
                })
            }
        })

        self.totSalesByDate = ko.computed(function() {
            return self.filterSalesRecords().reduce((acc, current) => acc + (current.saleprice || 0), 0)
        })

        self.totSalesByProd = ko.computed(function() {
            return self.filterSalesByProduct().reduce((acc, current) => acc + (current.totalSales || 0), 0)
        })

        function getSrFilterCondition(filterOp, record) {
            if (filterOp == 'Equal') {
                return new moment(record.sdate).isSame(new moment(self.sdateFromFilter()), 'day')
            }
            else if (filterOp == 'Before') {
                return new moment(record.sdate).isBefore(new moment(self.sdateToFilter()), 'day')
            }
            else if (filterOp == 'After') {
                return new moment(record.sdate).isAfter(new moment(self.sdateFromFilter()), 'day')
            }
            else {
                return new moment(record.sdate).isBetween(new moment(self.sdateFromFilter()), new moment(self.sdateToFilter()), null, '[]')
            }
        }

        // INVENTORY TAB functions
        self.clearSearch = function() {
            $('#prod-search-bar').val('')
            self.searchFilter('')
        }

        searchForm.addEventListener('submit', function(e) {
            e.preventDefault()

            self.searchFilter($('#prod-search-bar').val())
        })

        addForm.addEventListener('submit', function(e) {
            e.preventDefault()
            
            if (showConfirm("Add this item?")) {
                let price = document.querySelector('#prod-price').value
                let newItem = {
                    pnumber: document.querySelector('#prod-num').value,
                    pname: document.querySelector('#prod-name').value,
                    category: document.querySelector('#prod-category').value,
                    pqty: document.querySelector('#prod-qty').value,
                    pprice: parseFloat(price).toFixed(2)
                }

                let categoryName = ko.utils.arrayFirst(self.categories(), (category) => {
                    return category.RowId() == newItem.category
                }).Name()

                let stmt = db.prepare("INSERT INTO PRODUCT(pnumber, pname, category, pqty, pprice) VALUES (?, ?, ?, ?, ?)")
                stmt.run(newItem.pnumber, newItem.pname, newItem.category, newItem.pqty, newItem.pprice)

                stmt.finalize()

                db.get(`SELECT last_insert_rowid() as id`, (err, row) => {
                    self.products.push(new Product(row.id, newItem.pnumber, newItem.pname, newItem.category, categoryName, newItem.pqty, newItem.pprice))

                    // Record add in inventory ledger
                    let currDateTime = new moment().format('YYYY-MM-DDTHH:mm:ss')
                    let recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, olddesc, newdesc, oldprice, newprice, oldcount, newcount, reason) 
                                                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                    recordStmt.run(currDateTime, row.id, currentUserId, '-', newItem.pname, 0, newItem.pprice, 0, newItem.pqty, 'New Product added')
                    recordStmt.finalize()
                })

                document.querySelector('#prod-num').value = ''
                document.querySelector('#prod-name').value = ''
                document.querySelector('#prod-category').value = self.categories()[0].RowId()
                document.querySelector('#prod-qty').value = 0
                document.querySelector('#prod-price').value = 0
                document.querySelector('#prod-num').focus()
                $('#add-form-modal').modal('toggle')
            }
        })

        restockForm.addEventListener('submit', function(e) {
            e.preventDefault()
            $('#restock-modal').modal('toggle')
            if (self.invChangeType == "UNLOAD" && $('#restock-qty').val() > self.invChangeProduct.ProdQty()) {
                showNotification({
                    title: "Error!",
                    message: "Quantity to unload exceeds quantity of product on-hand!",
                    type: 'error'
                })
            } else {
                if (showConfirm('Are you sure?')) {
                    $('#reason-modal').modal('toggle')
                }
            }
        })

        self.restockRow = (product) => {
            self.invChangeType = "RESTOCK"
            self.invChangeProduct = product
            $('#restock-modal').modal('toggle')
            $('#restock-qty').val(null)
        }

        self.unloadRow = (product) => {
            self.invChangeType = "UNLOAD"
            self.invChangeProduct = product
            $('#restock-modal').modal('toggle')
            $('#restock-qty').val(null)
        }

        self.confirmDiscontinue = (product) => {
            if (showConfirm("Discontinue this product?")) {
                $('#reason-modal').modal('toggle')
                self.invChangeType = "DISCONTINUE"
                self.invChangeProduct = product
            }
        }

        self.discontinueProduct = (product, reason) => {
            self.products.remove(p => {
                return product.RowId() == p.RowId()
            })
            self.srFilterProducts.remove(p => {
                return product.RowId() == p.RowId()
            })

            db.serialize(() => {
                let currDateTime = new moment().format('YYYY-MM-DDTHH:mm:ss')
                let updStmt = db.prepare(`UPDATE PRODUCT SET pqty = 0, isactive = FALSE WHERE rowid = ?`)
                updStmt.run(product.RowId())
                updStmt.finalize()

                let recordStmt
                recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, oldcount, newcount, reason) VALUES(?, ?, ?, ?, ?, ?)`)
                recordStmt.run(currDateTime, product.RowId(), currentUserId, product.ProdQty(), 0, reason)
                recordStmt.finalize()
            })
            
            showNotification({
                title: 'Success',
                message: 'Product has been discontinued and removed from the inventory'
            })
        }

        self.restockProduct = (product, reason) => {  
            let addqty = parseFloat($('#restock-qty').val())
            let currDateTime = new moment().format('YYYY-MM-DDTHH:mm:ss')
            let oldqty = parseFloat(product.ProdQty())
            let totalqty = oldqty + addqty
            product.ProdQty(totalqty)

            db.serialize(() => {
                // Update Products table
                let updStmt = db.prepare(`UPDATE PRODUCT SET pqty = ? WHERE rowid = ?`)
                updStmt.run(totalqty, product.RowId())
                updStmt.finalize()
    
                // Update Inventory ledger table
                let recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, oldcount, newcount, reason) VALUES(?, ?, ?, ?, ?, ?)`)
                recordStmt.run(currDateTime, product.RowId(), currentUserId, oldqty, totalqty, reason)
                recordStmt.finalize()
            })

            showNotification({
                title: 'Success!',
                message: 'Product succesfully re-stocked.'
            })
        }

        self.unloadProduct = (product, reason) => {
            let subqty = parseFloat($('#restock-qty').val())
            let currDateTime = new moment().format('YYYY-MM-DDTHH:mm:ss')
            let oldqty = parseFloat(product.ProdQty())
            let totalqty = oldqty - subqty
            product.ProdQty(totalqty)

            db.serialize(() => {
                // Update Products table
                let updStmt = db.prepare(`UPDATE PRODUCT SET pqty = ? WHERE rowid = ?`)
                updStmt.run(totalqty, product.RowId())
                updStmt.finalize()
    
                // Update Inventory ledger table
                let recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, oldcount, newcount, reason) VALUES(?, ?, ?, ?, ?, ?)`)
                recordStmt.run(currDateTime, product.RowId(), currentUserId, oldqty, totalqty, reason)
                recordStmt.finalize()
            })

            showNotification({
                title: 'Success!',
                message: 'Product succesfully unloaded.'
            })

        }

        self.confirmEditProduct = (product) => {
            if (showConfirm("Save changes?")) {
                self.invChangeType = "EDIT"
                self.invChangeProduct = product
                $('#reason-modal').modal('toggle')
            }
        }

        self.saveEdit = (product, reason) => {
            let oldname = product.ProdName()
            let newname = $('#pname-' + product.RowId()).val()
            let oldprice = product.ProdPrice()
            let newprice = $('#pprice-' + product.RowId()).val()
            let oldcateg = product.Category()
            let newcateg = $('#pcat-' + product.RowId()).val()
    
            if ((newname != oldname || newprice != oldprice || newcateg != oldcateg)) {
                let currDateTime = new moment().format('YYYY-MM-DDTHH:mm:ss')
                product.ProdName(newname)
                product.ProdPrice(newprice)
                product.Category(newcateg)
        
                let updStmt = db.prepare(`UPDATE PRODUCT SET pname = ?, pprice = ?, category = ? WHERE rowid = ?`)
                updStmt.run(product.ProdName(), product.ProdPrice(), product.Category(), product.RowId())
                updStmt.finalize()
    
                // Update Inventory ledger table
                let recordStmt
                if (newname != oldname && newprice != oldprice) {
                    recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, olddesc, newdesc, oldprice, newprice, reason) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
                    recordStmt.run(currDateTime, product.RowId(), currentUserId, oldname, newname, oldprice, newprice, reason)
                }
                else if (newname != oldname && newprice == oldprice) {
                    recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, olddesc, newdesc, reason) VALUES(?, ?, ?, ?, ?, ?)`)
                    recordStmt.run(currDateTime, product.RowId(), currentUserId, oldname, newname, reason)
                }
                else if (newname == oldname && newprice != oldprice) {
                    recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, oldprice, newprice, reason) VALUES(?, ?, ?, ?, ?, ?)`)
                    recordStmt.run(currDateTime, product.RowId(), currentUserId, oldprice, newprice, reason)
                }
                else if (oldcateg != newcateg) {
                    recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, reason) VALUES(?, ?, ?, ?)`)
                    recordStmt.run(currDateTime, product.RowId(), currentUserId, reason)
                }
                recordStmt.finalize()
    
                ipcRenderer.send('notif:send', {
                    title: 'Success!',
                    message: 'Product details successfully updated!'
                })
            }
            else {
                $('#pname-' + product.RowId()).val(product.ProdName())
                $('#pprice-' + product.RowId()).val(product.ProdPrice())
                $('#pcat-' + product.RowId()).val(product.Category())
            }
            product.IsEnabled(!product.IsEnabled())
        }

        self.uploadInventoryFile = () => {
            let file = dialog.showOpenDialogSync(null)
            if (file) {
                let workbook = XLSX.readFile(file[0])
                let sheets = workbook.SheetNames
    
                let newProducts = XLSX.utils.sheet_to_json(workbook.Sheets[sheets[0]])
                let createStmt, updateStmt
                let addedProductsCount = 0
                newProducts.forEach(product => {
                    let foundItem = ko.utils.arrayFirst(self.products(), (p) => {
                        return p.ProdNum() == product.pnumber
                    })
                    if (!foundItem) {
                        let newProdCat
                        let categ = ko.utils.arrayFirst(self.categories(), (c) => {
                            return c.RowId() == product.category
                        })
                        newProdCat = (categ) ? {
                            id: product.category,
                            name: categ.Name()
                        } : {
                            id: 99,
                            name: 'Misc'
                        }

                        db.serialize(() => {
                            createStmt = db.prepare(`INSERT INTO PRODUCT(pnumber, pname, pqty, pprice, category) VALUES(?, ?, ?, ?, ?)`)
                            createStmt.run(product.pnumber, product.pname, product.pqty, product.pprice, newProdCat.id)
                            createStmt.finalize()
            
                            db.get(`SELECT last_insert_rowid() as id`, (err, row) => {
                                self.products.push(new Product(row.id, product.pnumber, product.pname, newProdCat.id, newProdCat.name, product.pqty, product.pprice))
                                
                                // Record add in inventory ledger
                                let currDateTime = new moment().format('YYYY-MM-DDTHH:mm:ss')
                                let recordStmt = db.prepare(`INSERT INTO INVENTORY_LEDGER(scdate, pid, changedby, olddesc, newdesc, oldprice, newprice, oldcount, newcount, reason) 
                                                            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
                                recordStmt.run(currDateTime, row.id, currentUserId, '-', product.pname, 0, product.pprice, 0, product.pqty, 'New Product added via Import')
                                recordStmt.finalize()
                            })
                            addedProductsCount++
                        })
                    }
                })
    
                showNotification({    
                    title: 'Success!',
                    message: `Added ${addedProductsCount} new products to the inventory!`
                })
            }
        }

        self.exportInventoryFile = () => {
            let file = dialog.showSaveDialogSync(null, {
                filters: [
                    {
                        name: "Excel Files",
                        extensions: ["xls", "xlsx"]
                    }
                ]
            })
            if (file) {
                let tempProducts = []
    
                ko.utils.arrayForEach(self.products(), (prod) => {
                    tempProducts.push({
                        pnumber: prod.ProdNum(),
                        pname: prod.ProdName(),
                        pqty: prod.ProdQty(),
                        pprice: prod.ProdPrice(),
                        category: prod.Category()
                    })
                })
                
                let wb = XLSX.utils.book_new()
                let ws = XLSX.utils.json_to_sheet(tempProducts)
                XLSX.utils.book_append_sheet(wb, ws)
                XLSX.writeFile(wb, file)
    
                showNotification({
                    title: 'Success!',
                    message: 'Successfully exported inventory file.'
                })
            }
        }

        self.openCategoryModal = () => {
            $('#category-modal').modal('toggle')
        }

        self.addNewCategory = () => {
            if (showConfirm('Add new category?')) {
                let index = self.categories().length - 2
                let newCategory = $('#new-category-name').val()
                let newId = self.categories()[index].RowId() + 1

                let stmt = db.prepare(`INSERT INTO CATEGORY(rowid, name) VALUES(?, ?)`)
                stmt.run(newId, newCategory)
                stmt.finalize()

                self.categories.splice(index + 1, 0, new Category(newId, newCategory))
                $('#new-category-name').val('')
            }
        }

        self.removeCategory = (data) => {
            if (showConfirm('Are you sure you want to delete this category?\n\r\nAll existing products under this category will revert to Misc category by default.')) {
                ko.utils.arrayForEach(ko.utils.arrayFilter(self.products(), product => {
                    return product.Category() == data.RowId()
                }), product => {
                    product.Category(99)
                    product.CategoryName('Misc')
                })
                
                db.serialize(() => {
                    let updateStmt = db.prepare(`UPDATE PRODUCT SET category = 99 WHERE category = ?`)
                    updateStmt.run(data.RowId())
                    updateStmt.finalize()

                    let deleteStmt = db.prepare(`DELETE FROM CATEGORY WHERE rowid = ?`)
                    deleteStmt.run(data.RowId())
                    deleteStmt.finalize()    
                })
                
                self.categories.remove(category => {
                    return category.RowId() == data.RowId()
                })

                showNotification({
                    title: 'Success!',
                    message: `Category - ${data.Name()} successfully removed.`
                })  
            }
        }

        self.processInvChange = () => {
            let reason = $('#change-reason').val()
            if (self.invChangeType == "DISCONTINUE") {
                self.discontinueProduct(self.invChangeProduct, reason)
            } else if (self.invChangeType == "RESTOCK") {
                self.restockProduct(self.invChangeProduct, reason)
            } else if (self.invChangeType == "UNLOAD") {
                self.unloadProduct(self.invChangeProduct, reason)
            } else if (self.invChangeType == "EDIT") {
                self.saveEdit(self.invChangeProduct, reason)
            }

            $('#reason-modal').modal('toggle')
            $('#change-reason').val("")
            self.invChangeType = ""
            self.invChangeProduct = {}
        }

        // Sales functions
        $('#nav-sales-tab').on('shown.bs.tab', e => {
            self.isPOSActive(true)
        })

        $('#nav-sales-tab').on('hidden.bs.tab', e => {
            self.isPOSActive(false)
        })


        onScan.attachTo(document, {
            suffixKeyCodes: [13],
            onScan: (sCode, iQty) => {
                if (self.isPOSActive()) {
                    let prod = ko.utils.arrayFirst(self.products(), (product) => {
                        return product.ProdNum() == sCode
                    })
    
                    if (prod != null) {
                        $('#sales-prod-id').val(prod.RowId())
                        $('#sales-prod-qty').val(1)
                        self.addProduct()
                    } else {
                        showNotification({
                            title: "Warning!",
                            message: 'This product does not exist in the Inventory!',
                            type: 'info'
                        })
                    }
                }
            }
        })
        
        self.addProduct = () => {
            let prodId = $('#sales-prod-id').val()
            let saleQty = parseFloat($('#sales-prod-qty').val())

            if (prodId && saleQty && saleQty > 0) {
                let soldProduct = ko.utils.arrayFirst(self.products(), function(product) {
                    return product.RowId() == prodId
                })
                if (soldProduct.ProdQty() >= saleQty) {
                    soldProduct.ProdQty(soldProduct.ProdQty() - saleQty)
                    let unitPrice = parseFloat(soldProduct.ProdPrice())
                    let salesPrice = unitPrice * saleQty
                    let existingSale = ko.utils.arrayFirst(self.sales(), function(sale) {
                        return sale.RowId() == prodId
                    })

                    // Check if product has already been added to sale
                    if (existingSale) {
                        existingSale.SaleQty(existingSale.SaleQty() + saleQty)
                        existingSale.SalePrice(existingSale.SalePrice() + salesPrice)
                    }
                    else {
                        self.sales.push(new Sale(prodId, soldProduct.ProdNum(), soldProduct.ProdName(), saleQty, salesPrice))
                    }
        
                    //$('#sales-prod-id').val('')
                    $('#sales-prod-qty').val('')
                }
                else {
                    showNotification({
                        title: "Oh no!",
                        message: 'Not enough available product!',
                        type: 'error'
                    })
                }
            }
        }

        addSaleForm.addEventListener('submit', function(e) {
            e.preventDefault()

            self.addProduct()
            $('#sale-qty-modal').modal('toggle')
        })


        salesForm.addEventListener('submit', function(e) {
            e.preventDefault()

            if (self.sales().length > 0) $('#amt-tender-modal').modal('toggle')
        })

        self.subtractSaleQty = (data) => {
            if (data.SaleQty() > 1) {
                let unitPrice = data.SalePrice() / data.SaleQty()
                data.SaleQty(data.SaleQty() - 1)
                data.SalePrice(data.SaleQty() * unitPrice)
            }
            else {
                if (self.sales().length > 0) {
                    self.removeSaleProduct(data)
                }
                else if (self.txnRevisions().length > 0) {
                    self.removeTxnRevision(data)
                }
            }
        }

        self.removeSaleProduct = (data) => {
            self.sales.remove(sale => {
                return sale.RowId() == data.RowId()
            })
        }

        self.removeTxnRevision = (data) => {
            self.txnRevisions.remove(sale => {
                return sale.RowId() == data.RowId()
            })
        }

        $('#sale-qty-modal').on('shown.bs.modal', () => {
            $('#sales-prod-qty').focus()
            $('#sales-search-input').val('')
            self.prodDynFilter('')
            $('#autocomplete-dd').dropdown('hide');
        })

        $('#amt-tender-modal').on('shown.bs.modal', () => {
            $('#sales-tender-amt').focus()
        })

        amtTenderForm.addEventListener('submit', function(e) {
            e.preventDefault()
            self.isProcessing(true)
            let currMoment = new moment()
            let amountGiven = parseFloat($('#sales-tender-amt').val())
            let currentDateTime = currMoment.format('YYYY-MM-DDTHH:mm:ss')
            let invoicenum = currMoment.format('YYYYMMDDHHmmss-')
            
            if (amountGiven >= self.totalSalesPrice()) {
                self.amountTendered(amountGiven)
                if (showConfirm("Proceed with sale?")) {
                    $('#amt-tender-modal').modal('toggle')
    
                    // CREATE TRANSACTION RECORD
                    let txnStmt = db.prepare(`INSERT INTO TRANSACTION_RECORD(tdate, totalsales, invoicenumber, tenderamt, change, cashier) VALUES(?, ?, ?, ?, ?, ?)`)
                    txnStmt.run(currentDateTime, self.totalSalesPrice(), invoicenum, self.amountTendered(), self.changeGiven(), currentUserId)
                    txnStmt.finalize()
    
                    // Get Transaction ID
                    db.get(`SELECT last_insert_rowid() as id`, (err, row) => {
                        // UPDATE transaction record with invoice number
                        invoicenum += row.id.toString().padStart(8, '0')
                        let updateInvoiceStmt = db.prepare(`UPDATE TRANSACTION_RECORD SET invoicenumber = ? WHERE rowid = ?`)
                        updateInvoiceStmt.run(invoicenum, row.id)
                        updateInvoiceStmt.finalize()
    
                        // PUSH TRANSACTION RECORD to table
                        // retrieve cashier name first 
                        let newTxnId = row.id
                        db.get(`SELECT fname || ' ' || lname AS name FROM USER WHERE rowid = ${currentUserId}`, (err, row) => {
                            self.transactions.push(new Transaction(newTxnId, currentDateTime, self.totalSalesPrice(), invoicenum, self.amountTendered(), self.changeGiven(), row.name))
                        })
    
                        // CREATE SALES RECORDS 
                        for (let i=0; i < self.sales().length; i++) {
                            let pid = self.sales()[i].RowId()
                            let pname = self.sales()[i].ProdName()
                            let sprice = self.sales()[i].SalePrice()
                            let pqty = self.sales()[i].SaleQty()
                            
                            let updateStmt = db.prepare("UPDATE PRODUCT SET pqty = pqty - ? WHERE rowid = ?")
                            updateStmt.run(pqty, pid)
            
                            updateStmt.finalize()
        
                            let recordSaleStmt = db.prepare(`INSERT INTO SALES_RECORD(sdate, pid, pname, tid, saleprice, saleqty) VALUES(?, ?, ?, ?, ?, ?)`)
                            recordSaleStmt.run(currentDateTime, pid, pname, row.id, sprice, pqty)
                        }
                        
                        showNotification({
                            title: 'Success!',
                            message: 'Transaction successful. Thank you!'
                        })
                    })
                        
        
                    // $('#sales-prod-id').val('')
                    $('#sales-prod-qty').val('')
                }
            }
            else {
                showNotification({
                    title: "Oh no!",
                    message: 'Insufficient payment!',
                    type: 'error'
                })
            }
        })

        self.printReceipt = function() {
            showNotification({
                title: "Thank you!",
                message: 'Printing receipt...',
                type: 'info'
            })

            self.sales([])
            self.amountTendered(0)
            self.isProcessing(false)
        }

        // TRANSACTION TABLE functions
        self.viewTxnDetails = function() {
            let txnId = $('#selected-txn-row-id').val()

            self.transactionSales([])
            db.each(`SELECT pname, saleqty, saleprice FROM SALES_RECORD WHERE tid = ${txnId}`, function(err, row) {
                self.transactionSales.push(row)
            })
        }

        self.editTxnRow = (txn) => {
            let txnId = txn.RowId()
            self.editedTxnId = txnId

            self.txnRevisions([])
            db.each(`SELECT s.rowid, p.pnumber, s.pname, s.saleqty, s.saleprice, s.tid FROM SALES_RECORD s, PRODUCT p WHERE s.pid = p.rowid AND s.tid = ${txnId}`, function(err, row) {
                self.txnRevisions.push(new Sale(row.rowid, row.pnumber, row.pname, row.saleqty, row.saleprice, row.tid))
            })

            if (self.txnRevisions().length > 0) {
                $('#edit-txn-modal').modal('toggle')
            }
        }

        self.refundTxn = () => {
            self.editTxnAction = "Refund"
            if (showConfirm("Refund this whole transaction?")) {
                $('#edit-txn-modal').modal('toggle')
                $('#supervisor-login-modal').modal('toggle')

                self.txnRevisions([])
            }
        }

        self.confirmEditTxn = () => {
            self.editTxnAction = "Revision"
            if (showConfirm("Save changes to this transaction?")) {
                $('#edit-txn-modal').modal('toggle')
                $('#supervisor-login-modal').modal('toggle')
            }
        }

        loginForm.addEventListener('submit', e => {
            e.preventDefault()
            
            let username = $('#login-username').val()
            let password = $('#login-password').val()

            // Verify user
            if (self.currentUser().UserName() == username) {
                showNotification({
                    title: 'Error:',
                    message: 'You cannot approve your own transaction revision!',
                    type: 'error'
                })
            } else {
                db.get(`SELECT rowid, pass, roleid FROM USER WHERE user = '${username}'`, async(err, user) => {
                    if(err) {
                        console.log(err)
                    }
                    else {
                        if (user.roleid == 2) {
                            showNotification({
                                title: "Unauthorized!",
                                message: 'A supervisor / manager / admin must approve this revision!',
                                type: 'error'
                            })
                        } else {
                            bcrypt.compare(password, user.pass)
                            .then(res => {
                                if (!res) {
                                    showNotification({
                                        title: "Oh no!",
                                        message: 'Password is incorrect!',
                                        type: 'error'
                                    })
                                }
        
                                return res
                            })
                            .then(res => {
                                if (res) {
                                    $('#supervisor-login-modal').modal('toggle')
                                    self.saveEditTxn(user.rowid)
                                } 
                            })
                        }
                    }
                })

            }
        })

        self.saveEditTxn = (approver) => {
            let affectedSales = ko.utils.arrayFilter(self.salesRecords(), (item, index) => {
                return item.tid = self.editedTxnId
            })
            let saleDifference = 0
            let changes = ""

            // Revise each Sales Record
            ko.utils.arrayForEach(affectedSales, (sale, index) => {
                let revision = ko.utils.arrayFirst(self.txnRevisions(), (rev, i) => {
                    return rev.RowId() == sale.rowid
                })

                if (revision) {
                    if (sale.saleqty != revision.SaleQty()) {
                        let diff = 0
                        console.log(`${revision.ProdName()} changed from ${sale.saleqty} to ${revision.SaleQty()}`)
                        console.log(`${revision.ProdName()} changed from ${sale.saleprice} to ${revision.SalePrice()}`)
                        changes += `${revision.ProdName()}: qty bought changed from ${sale.saleqty} to ${revision.SaleQty()}; `
                        
                        diff = sale.saleqty - revision.SaleQty()
                        saleDifference += sale.saleprice - revision.SalePrice()
                        sale.saleqty = revision.SaleQty()
                        sale.saleprice = revision.SalePrice()
                        
                        // Update Sales Record
                        let updStmt = db.prepare(`UPDATE SALES_RECORD SET saleqty = ?, saleprice = ? WHERE rowid = ?`)
                        updStmt.run(revision.SaleQty(), revision.SalePrice(), sale.rowid)
                        updStmt.finalize()
                        
                        // Return the difference to the inventory
                        if (diff > 0) {
                            // Update database
                            let returnStmt = db.prepare(`UPDATE PRODUCT SET pqty = pqty + ? WHERE rowid = ?`)
                            returnStmt.run(diff, sale.pid)
                            returnStmt.finalize()

                            // Update UI
                            let product = ko.utils.arrayFirst(self.products(), (product, pIndex) => {
                                return product.RowId() == sale.pid
                            })
                            product.ProdQty(product.ProdQty() + diff)
                        }
                    }
                } else {
                    console.log(`Refund ${sale.pname}`)
                    changes += `${sale.saleqty} units of ${sale.pname} entirely refunded; `
                    saleDifference += sale.saleprice

                    // Return to inventory
                    // Update database
                    let returnStmt = db.prepare(`UPDATE PRODUCT SET pqty = pqty + ? WHERE rowid = ?`)
                    returnStmt.run(sale.saleqty, sale.pid)
                    returnStmt.finalize()

                    // Update UI
                    let product = ko.utils.arrayFirst(self.products(), (product, pIndex) => {
                        return product.RowId() == sale.pid
                    })
                    product.ProdQty(product.ProdQty() + sale.saleqty)

                    // Delete Sales Record
                    let deleteStmt = db.prepare(`DELETE FROM SALES_RECORD WHERE rowid = ?`)
                    deleteStmt.run(sale.rowid)
                    deleteStmt.finalize()
                }
            })

            // If there are any changes
            if (saleDifference > 0) {
                // Reflect changes in Transaction record
                let transaction = ko.utils.arrayFirst(self.transactions(), (txn, tindex) => {
                    return txn.RowId() == self.editedTxnId
                })
                transaction.TotalSales(transaction.TotalSales() - saleDifference)
                transaction.Change(transaction.Change() + saleDifference)

                let txnStatus = (self.editTxnAction == 'Refund' || transaction.TotalSales() == 0) ? "Refunded" : "Revised"
                let ledgerStatus = (self.editTxnAction == 'Refund' || transaction.TotalSales() == 0) ? "Refund" : "Revision"

                let updTxnStmt = db.prepare(`UPDATE TRANSACTION_RECORD SET totalsales = ?, change = ?, status = ? WHERE rowid = ?`)
                updTxnStmt.run(transaction.TotalSales(), transaction.Change(), txnStatus, self.editedTxnId)
                updTxnStmt.finalize()

                // Log change in Transaction Change Ledger
                let currentDate = new moment().format('YYYY-MM-DDTHH:mm:ss')
                let createLedgerStmt = db.prepare(`INSERT INTO TXN_CHANGE_LEDGER(tcdate, changetype, changedby, approvedby, changes, oldtotal, newtotal, tid) 
                                                    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
                createLedgerStmt.run(currentDate, ledgerStatus, currentUserId, approver, changes, transaction.TotalSales() + saleDifference, transaction.TotalSales(), self.editedTxnId)
                createLedgerStmt.finalize()
            }

            showNotification({
                title: 'Success!',
                message: 'Transaction record revised.'
            })
        }

        self.cancelEditTxn = () => {
            self.txnRevisions([])
            self.editedTxnId = 0

            $('#edit-txn-modal').modal('toggle')
        }

        self.getTotalSales = ko.computed(function() {
            let totalSales = 0
            ko.utils.arrayForEach(self.transactionSales(), function(item, index) {
                totalSales += item.saleprice
            })
            return totalSales
        })
    
        self.changeTdateOp = function(data, event) {
            self.tdateFilterOp(event.target.text)
            self.tdateFromFilter('')
            self.tdateToFilter('')
            $('#txn-frdate').val('')
            $('#txn-todate').val('')
        }

        txnFilterForm.addEventListener('submit', function(e) {
            e.preventDefault()
            
            if (self.txnFilterType() == 'tdate') {
                self.tdateFromFilter(new moment($('#txn-frdate').val()).format('YYYY-MM-DD'))
                self.tdateToFilter(new moment($('#txn-todate').val()).format('YYYY-MM-DD'))
            }
            else {
                self.invoiceFilter($('#txn-invoice-num').val().trim())
            }
        })

        // STOCK LEDGER TABLE functions
        self.refreshStockLedgerTable = function() {
            self.stockRecords([])
            db.each(`SELECT i.rowid, i.scdate, p.pname, u.user, i.oldcount, i.newcount, i.olddesc, i.newdesc, i.oldprice, i.newprice, i.reason
                    FROM INVENTORY_LEDGER i, PRODUCT p, USER u 
                    WHERE i.pid = p.rowid AND i.changedby = u.rowid
                    ORDER BY i.scdate DESC`, function(err, row) {
                self.stockRecords.push(row)
            })

            showNotification({
                title: 'Success!',
                message: 'Stock Ledger records refreshed.'
            })
        }

        self.resetStockFilter = function() {
            self.stockFilter('all')
        }

        self.filterStockChanges = function() {
            self.stockFilter('stock-changes')
        }

        self.filterPriceChanges = function() {
            self.stockFilter('price-changes')
        }

        self.filterProductChanges = function() {
            self.stockFilter('product-changes')
        }


        // SALES RECORDS functions
        self.exportCurrentViewSalesByProduct = function() {
            if (showConfirm("Export this view to an excel file?")) {
                let ws = XLSX.utils.json_to_sheet(self.filterSalesByProduct(), {header: ['category', 'pname', 'totalSales', 'totalQty']})
                let wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, "Total Sales by Product")
                let exportFileName = dialog.showSaveDialogSync(null, {
                    filters: [
                        { name: 'Spreadsheets (*.xls, *.xlsx)', extensions: ['xlsx', 'xls'] }
                    ]
                })
                XLSX.writeFile(wb, exportFileName)
            }
        }
        
        self.exportCurrentViewSalesByDate = function() {
            if (showConfirm("Export this view to an excel file?")) {
                let ws = XLSX.utils.json_to_sheet(self.filterSalesRecords(), {header: ['sdate', 'pname', 'saleqty', 'saleprice']})
                let wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, "Total Sales by Date")
                let exportFileName = dialog.showSaveDialogSync(null, {
                    filters: [
                        { name: 'Spreadsheets (*.xls, *.xlsx)', extensions: ['xlsx', 'xls'] }
                    ]
                })
                XLSX.writeFile(wb, exportFileName)
            }
        }

        self.refreshSalesRecordsTable = function() {
            self.sdateFilterOp('Equal')
            $('#sr-category-filter').val(0)
            $('#sr-pname-filter').val(0)
            $('#sr-frdate').val('')
            $('#sr-todate').val('')
            self.srCategFilter(0)
            self.srPnameFilter(0)
            self.sdateFromFilter('')
            self.sdateToFilter('')

            self.salesRecords([])
            self.salesByProduct([])
            db.each(`SELECT s.rowid, s.sdate, p.rowid AS pid, p.pname, p.category, s.saleprice, s.saleqty FROM SALES_RECORD s, PRODUCT p WHERE s.pid = p.rowid ORDER BY s.sdate DESC`, function(err, row) {
                self.salesRecords.push(row)
            })
            db.each(`SELECT p.rowid AS pid, p.pname, p.category AS cid, c.name AS category, SUM(s.saleprice) AS totalSales, SUM(s.saleqty) AS totalQty FROM SALES_RECORD s, PRODUCT p, CATEGORY c WHERE s.pid = p.rowid AND p.category = c.rowid GROUP BY s.pid ORDER BY s.pname`, (err, row) => {
                self.salesByProduct.push(row)
            })

            showNotification({
                title: 'Success!',
                message: 'Sales Records refreshed.'
            })
        }

        self.toggleSalesRecordsDisplay = function() {
            self.showAllSales(!self.showAllSales())
        }
        
        self.changeSdateOp = function(data, event) {
            self.sdateFilterOp(event.target.text)
            self.sdateFromFilter('')
            self.sdateToFilter('')
            $('#sr-frdate').val('') 
            $('#sr-todate').val('')
        }

        self.sortSales = function(event, data) {
            let id = data.target.id
            let col = id.substring(id.indexOf('-') + 1, id.lastIndexOf('-'))

            self.sortByAscending(self.currentSortCol() != col || !self.sortByAscending())
            self.currentSortCol(col)

            self.salesByProduct.sort((a, b) => {
                let keyA = a[col]
                let keyB = b[col]

                // if dir = asc
                if (self.sortByAscending()) {
                    if (keyA < keyB) return -1
                    if (keyA > keyB) return 1
                    return 0
                }
                else {
                    if (keyA < keyB) return 1
                    if (keyA > keyB) return -1
                    return 0
                }
            })
        }


        // MY ACCOUNT functions
        self.triggerMyAccountTab = function() {
            $('#nav-myaccount-tab').click()
        }

        self.openNewUserModal = function() {
            $('#add-user-modal').modal('toggle')
        }

        self.addNewUser = function() {
            let formValues = $('#add-user-form').serializeArray()
            if (formValues[3].value != formValues[4].value) {
                showNotification({
                    title: "Oh no!",
                    message: 'Passwords do not match!',
                    type: 'error'
                })
            }
            else if (showConfirm("Add this user?")) {
                bcrypt.hash(formValues[3].value, saltRounds, function(err, hash) {
                    let addStmt = db.prepare(`INSERT INTO USER(fname, lname, user, pass, roleid) VALUES(?, ?, ?, ?, ?)`)
                    addStmt.run(formValues[0].value, formValues[1].value, formValues[2].value, hash, formValues[5].value)
                    addStmt.finalize()

                    db.get(`SELECT last_insert_rowid() as id`, (err, row) => {
                        self.users.push(new User(row.id, formValues[0].value, formValues[1].value, formValues[2].value, formValues[5].value))
                    })
                });

                showNotification({
                    title: 'Success!',
                    message: 'New user added.'
                })
                $('#add-user-modal').modal('toggle')
            }
        }

        self.triggerChangePwModal = function() {
            $('#change-pw-modal').modal('toggle')
        }

        self.changePassword = function() {
            let oldPwd = $('#old-user-pword').val()
            let newPw1 = $('#new-change-pword').val()
            let newPw2 = $('#new-change-confirm-pword').val()

            db.get(`SELECT pass FROM USER WHERE rowid = ${currentUserId}`, async(err, user) => {
                if(err) {
                    console.log(err)
                }
                else {
                    bcrypt.compare(oldPwd, user.pass)
                    .then(res => {
                        if (!res) {
                            showNotification({
                                title: "Oh no!",
                                message: 'Password is incorrect!',
                                type: 'error'
                            })
                        }
                        else if (res && newPw1!=newPw2) {
                            showNotification({
                                title: "Oh no!",
                                message: 'Passwords do not match!',
                                type: 'error'
                            })
                        }

                        return (res && newPw1==newPw2)
                    })
                    .then(res => {
                        if (res) {
                            bcrypt.hash(newPw1, saltRounds, function(err, hash) {
                                let updStmt = db.prepare(`UPDATE USER SET pass = ? WHERE rowid = ?`)
                                updStmt.run(hash, currentUserId)
                                updStmt.finalize()

                                showNotification({
                                    title: "Success!",
                                    message: 'Password changed successfully!',
                                    type: 'info'
                                })
                                ipcRenderer.send('user:signOut')
                            })
                        }
                    })
                }
            })
        }

        self.signOutUser = function() {
            ipcRenderer.send('user:signOut')
        }
    }

    ko.applyBindings(new viewModel())
})


function showConfirm(message) {
    return dialog.showMessageBoxSync(null, {
        title: 'Are you sure?',
        message: message,
        buttons: ['No', 'Yes']
    })
}

function showNotification(message) {
    ipcRenderer.send('notif:send', {
        title: message.title,
        message: message.message,
        type: message.type
    })
}
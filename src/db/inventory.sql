CREATE TABLE ROLE(name TEXT NOT NULL, desc TEXT)

CREATE TABLE USER(fname TEXT NOT NULL, lname TEXT NOT NULL, user TEXT NOT NULL, pass TEXT NOT NULL, email TEXT, roleid INTEGER NOT NULL, FOREIGN KEY(roleid) REFERENCES ROLE(rowid))

CREATE TABLE CATEGORY (name TEXT NOT NULL);
CREATE TABLE PRODUCT (pnumber TEXT NOT NULL, pname TEXT NOT NULL, category INTEGER NOT NULL, pqty REAL NOT NULL, pprice REAL NOT NULL, FOREIGN KEY(category) REFERENCES CATEGORY(rowid));
CREATE TABLE TRANSACTION_RECORD (tdate TEXT NOT NULL, totalsales REAL NOT NULL, invoicenumber TEXT NOT NULL, tenderamt REAL NOT NULL, change REAL NOT NULL, cashier INTEGER NOT NULL, FOREIGN KEY(cashier) REFERENCES USER(rowid));
CREATE TABLE SALES_RECORD(sdate TEXT NOT NULL, pid INTEGER NOT NULL, pname TEXT NOT NULL, tid INTEGER NOT NULL, saleprice REAL NOT NULL, saleqty REAL NOT NULL, FOREIGN KEY(pid) REFERENCES PRODUCT(rowid), FOREIGN KEY(tid) REFERENCES TRANSACTION_RECORD(rowid));
CREATE TABLE INVENTORY_LEDGER(scdate TEXT NOT NULL, pid INTEGER NOT NULL, changedby INTEGER NOT NULL, olddesc TEXT, newdesc TEXT, oldprice REAL, newprice REAL, oldcount REAL, newcount REAL, reason TEXT NOT NULL, FOREIGN KEY(pid) REFERENCES PRODUCT(rowid), FOREIGN KEY(changedby) REFERENCES USER(rowid));
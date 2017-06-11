import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpModule } from '@angular/http';
import { NgxDatatableModule } from '@swimlane/ngx-datatable';

import { CoreModule } from '../core/core.module';

import { TableRoutingModule } from './table-routing.module';
import { TableComponent } from './table.component';
import { TableService } from './table.service';

import '@swimlane/ngx-datatable/release/assets/icons.css';
import '@swimlane/ngx-datatable/release/index.css';
import '@swimlane/ngx-datatable/release/themes/material.css';

@NgModule({
    imports: [
        CommonModule,
        CoreModule,
        HttpModule,
        NgxDatatableModule,
        ReactiveFormsModule,
        TableRoutingModule
    ],
    declarations: [
        TableComponent
    ],
    providers: [TableService]
})
export class TableModule {}
